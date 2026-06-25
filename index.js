(function () {
  'use strict';
 
  const FOCUS_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 48; // r=48 in the SVG viewBox
  const MAX_TASKS = 3;
 
  // ---- State ----
  let mode = 'focus'; // 'focus' | 'break'
  let totalSeconds = FOCUS_SECONDS;
  let secondsLeft = FOCUS_SECONDS;
  let isRunning = false;
  let intervalId = null;
 
  // ---- Elements ----
  const display = document.getElementById('timer-display');
  const ringProgress = document.getElementById('timer-progress');
  const playPauseBtn = document.getElementById('play-pause');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const resetBtn = document.getElementById('reset-btn');
  const skipBtn = document.getElementById('skip-btn');
  const focusLabel = document.querySelector('.timer-readout__label');
  const taskList = document.getElementById('task-list');
  const taskCount = document.getElementById('task-count');
  const searchForm = document.querySelector('.search');
  const searchInput = document.getElementById('search-input');
  const currentTaskName = document.getElementById('current-task-name');
  let currentTaskItem = null;
  let addTaskBtn = null;
  let updateAddTaskState = null;
 
  // ---- Helpers ----
  function formatTime(totalSecs) {
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
 
  function updateDisplay() {
    display.textContent = formatTime(secondsLeft);
  }
 
  function updateRing() {
    const elapsedRatio = 1 - secondsLeft / totalSeconds;
    const offset = RING_CIRCUMFERENCE * (1 - elapsedRatio);
    ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    ringProgress.style.strokeDashoffset = `${offset}`;
  }
 
  function parseDuration(durationText) {
    const minutes = parseInt(String(durationText).trim().replace(/m$/i, ''), 10);
    return Number.isNaN(minutes) || minutes <= 0 ? 0 : minutes;
  }

  const STORAGE_KEY = 'pomodoroZenData';

  function isLocalStorageSupported() {
    try {
      const testKey = '__pomodoro_storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getStoredAppData() {
    if (!isLocalStorageSupported()) return null;
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function saveAppData() {
    if (!isLocalStorageSupported()) return;

    const tasks = Array.from(taskList.querySelectorAll('.task-item')).map((item) => ({
      name: item.dataset.taskName || item.querySelector('.task-item__name')?.textContent || '',
      duration: item.dataset.duration || item.querySelector('.task-item__duration')?.textContent || '25m',
      done: item.classList.contains('task-item--done'),
      isCurrent: item.classList.contains('task-item--current'),
    }));

    const data = {
      tasks,
      mode,
      totalSeconds,
      secondsLeft,
      isRunning,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function createTaskListItem({ name, duration, done = false, isCurrent = false }) {
    const li = document.createElement('li');
    li.className = 'task-item';
    if (done) {
      li.classList.add('task-item--done');
    }
    if (isCurrent) {
      li.classList.add('task-item--current');
    }

    li.dataset.duration = duration;
    li.dataset.taskName = name;

    li.innerHTML = `
      <div class="task-item__start">
        <button class="task-checkbox" type="button" aria-label="Mark ${escapeHtml(name)} complete">
          <span class="material-symbols-outlined icon icon--check" aria-hidden="true">check</span>
        </button>
        <span class="task-item__name">${escapeHtml(name)}</span>
      </div>
      <span class="task-item__duration">${escapeHtml(duration)}</span>
      <button class="task-delete" type="button" aria-label="Delete ${escapeHtml(name)}">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      </button>
    `.trim();

    if (done) {
      const checkbox = li.querySelector('.task-checkbox');
      checkbox.classList.add('task-checkbox--checked');
      checkbox.setAttribute('aria-label', `Mark ${name} incomplete`);
    }

    return li;
  }

  function loadAppData() {
    const stored = getStoredAppData();
    if (!stored || !Array.isArray(stored.tasks)) return false;

    taskList.innerHTML = '';
    stored.tasks.forEach((task) => taskList.appendChild(createTaskListItem(task)));

    if (typeof stored.mode === 'string') {
      mode = stored.mode;
    }
    if (typeof stored.totalSeconds === 'number' && stored.totalSeconds > 0) {
      totalSeconds = stored.totalSeconds;
    }
    if (typeof stored.secondsLeft === 'number' && stored.secondsLeft >= 0) {
      secondsLeft = stored.secondsLeft;
    }
    isRunning = false;

    const current = taskList.querySelector('.task-item.task-item--current');
    if (current) {
      currentTaskItem = current;
      const taskName = current.dataset.taskName || current.querySelector('.task-item__name')?.textContent || 'Current Task';
      currentTaskName.textContent = taskName;
      focusLabel.textContent = mode === 'focus' ? 'Focus Time' : 'Break Time';
    }

    return true;
  }
 
  function markTaskDone(taskItem) {
    if (!taskItem || taskItem.classList.contains('task-item--done')) return;
    const checkbox = taskItem.querySelector('.task-checkbox');
    const name = taskItem.dataset.taskName || 'task';
    taskItem.classList.add('task-item--done');
    checkbox.classList.add('task-checkbox--checked');
    checkbox.setAttribute('aria-label', `Mark ${name} incomplete`);
  }
 
  function selectTask(taskItem) {
    if (!taskItem || taskItem.classList.contains('task-item--done')) return;
    if (currentTaskItem === taskItem) return;
 
    if (currentTaskItem) {
      currentTaskItem.classList.remove('task-item--current');
    }
 
    currentTaskItem = taskItem;
    currentTaskItem.classList.add('task-item--current');
    const taskName = currentTaskItem.dataset.taskName || currentTaskItem.querySelector('.task-item__name')?.textContent || 'Current Task';
    const durationText = currentTaskItem.dataset.duration || '25m';
    const durationMinutes = parseDuration(durationText);
    const durationSeconds = durationMinutes * 60 || FOCUS_SECONDS;
 
    currentTaskName.textContent = taskName;
    mode = 'focus';
    focusLabel.textContent = 'Focus Time';
    totalSeconds = durationSeconds;
    secondsLeft = totalSeconds;
    updateDisplay();
    updateRing();
 
    if (isRunning) {
      pauseTimer();
      startTimer();
    }
  }
 
  function setPlayingIcon(playing) {
    playPauseIcon.textContent = playing ? 'pause' : 'play_arrow';
    playPauseBtn.setAttribute('aria-label', playing ? 'Pause timer' : 'Start timer');
  }
 
  function tick() {
    if (secondsLeft > 0) {
      secondsLeft -= 1;
      updateDisplay();
      updateRing();
    } else {
      completeSession();
    }
  }
 
  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    setPlayingIcon(true);
    intervalId = setInterval(tick, 1000);
  }
 
  function pauseTimer() {
    isRunning = false;
    setPlayingIcon(false);
    clearInterval(intervalId);
  }
 
  function resetTimer() {
    pauseTimer();
    secondsLeft = totalSeconds;
    updateDisplay();
    updateRing();
  }
 
  function switchMode(nextMode) {
    mode = nextMode;
    totalSeconds = mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;
    secondsLeft = totalSeconds;
    focusLabel.textContent = mode === 'focus' ? 'Focus Time' : 'Break Time';
    updateDisplay();
    updateRing();
  }
 
  function completeSession() {
    pauseTimer();
    if (mode === 'focus' && currentTaskItem) {
      markTaskDone(currentTaskItem);
    }
    const nextMode = mode === 'focus' ? 'break' : 'focus';
    switchMode(nextMode);
    saveAppData();
  }
 
  function skipSession() {
    const nextMode = mode === 'focus' ? 'break' : 'focus';
    switchMode(nextMode);
    if (isRunning) {
      // keep running into the next session
      startTimer();
    }
  }
 
  // ---- Task list interactivity ----
  function refreshTaskCount() {
    const total = taskList.querySelectorAll('.task-item').length;
    taskCount.textContent = `(${total})`;
    if (updateAddTaskState) updateAddTaskState();
    saveAppData();
  }
 
  function toggleTask(taskItem) {
    const checkbox = taskItem.querySelector('.task-checkbox');
    const name = taskItem.dataset.taskName || 'task';
    const isDone = taskItem.classList.toggle('task-item--done');
    checkbox.classList.toggle('task-checkbox--checked', isDone);
    checkbox.setAttribute(
      'aria-label',
      isDone ? `Mark ${name} incomplete` : `Mark ${name} complete`
    );
    saveAppData();
  }
 
  // ---- Event bindings ----
  playPauseBtn.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
    // tactile press feedback
    playPauseBtn.classList.add('is-pressed');
    setTimeout(() => playPauseBtn.classList.remove('is-pressed'), 150);
  });
 
  resetBtn.addEventListener('click', resetTimer);
 
  skipBtn.addEventListener('click', skipSession);
 
  taskList.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.task-delete');
    if (deleteBtn) {
      const li = deleteBtn.closest('.task-item');
      if (li) {
        const name = li.dataset.taskName || li.querySelector('.task-item__name')?.textContent || 'task';
        const ok = await showCustomConfirm(`Delete "${name}"?`, 'Delete');
        if (!ok) return;
        if (li === currentTaskItem) {
          currentTaskItem = null;
        }
        li.remove();
        refreshTaskCount();
        if (updateAddTaskState) updateAddTaskState();
        saveAppData();
      }
      return;
    }

    const taskItem = event.target.closest('.task-item');
    if (!taskItem) return;
    const checkboxButton = event.target.closest('.task-checkbox');
    if (checkboxButton) {
      toggleTask(taskItem);
      return;
    }

    selectTask(taskItem);
    saveAppData();
  });
 
  // Allow keyboard activation (Enter/Space) on task rows via the checkbox button
  taskList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const checkbox = event.target.closest('.task-checkbox');
    if (!checkbox) return;
    event.preventDefault();
    toggleTask(checkbox.closest('.task-item'));
  });
 
  // ---- Init ----
  const hasStoredData = loadAppData();
  updateDisplay();
  updateRing();
  setPlayingIcon(false);
  refreshTaskCount();
  if (!hasStoredData) {
    saveAppData();
  }

  // ---- Add task form handling ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const addTaskForm = document.querySelector('.add-task');
  if (addTaskForm) {
    const taskNameInput = addTaskForm.querySelector('.task-name');
    const taskDurationInput = addTaskForm.querySelector('.task-duration');
    const addTaskBtn = addTaskForm.querySelector('button.add-task');

    function formatDurationInput(raw) {
      const v = String(raw).trim();
      if (v === '') return '';
      // accept either number or number + m
      const numeric = v.endsWith('m') ? v.slice(0, -1) : v;
      const mins = parseInt(numeric, 10);
      if (Number.isNaN(mins) || mins <= 0) return '';
      return `${mins}m`;
    }

    async function createTask() {
      const name = (taskNameInput && taskNameInput.value || '').trim();
      const rawDuration = (taskDurationInput && taskDurationInput.value || '').toString().trim();
      const duration = formatDurationInput(rawDuration);
      
      // Validation
      if (!name) {
        showCustomConfirm('Please enter a task name.').then(() => {
          if (taskNameInput) taskNameInput.focus();
        });
        return;
      }
      
      if (!duration) {
        showCustomConfirm('Please enter a valid duration (1 or more minutes).').then(() => {
          if (taskDurationInput) taskDurationInput.focus();
        });
        return;
      }

      if (taskList.querySelectorAll('.task-item').length >= MAX_TASKS) {
        const upgrade = await showCustomConfirm(
          'Upgrade to the premium version for unlimited tasks.',
          'Upgrade'
        );
        if (upgrade) {
          const upsellButton = document.querySelector('.upsell__button');
          if (upsellButton) {
            upsellButton.focus();
          }
        }
        return;
      }

      const li = document.createElement('li');
      li.className = 'task-item';
      li.dataset.duration = duration;
      li.dataset.taskName = name;

      li.innerHTML = `
        <div class="task-item__start">
          <button class="task-checkbox" type="button" aria-label="Mark ${escapeHtml(name)} complete">
            <span class="material-symbols-outlined icon icon--check" aria-hidden="true">check</span>
          </button>
          <span class="task-item__name">${escapeHtml(name)}</span>
        </div>
        <span class="task-item__duration">${escapeHtml(duration)}</span>
        <button class="task-delete" type="button" aria-label="Delete ${escapeHtml(name)}">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      `.trim();

      taskList.appendChild(li);
      refreshTaskCount();
      if (updateAddTaskState) updateAddTaskState();
      if (taskNameInput) taskNameInput.value = '';
      if (taskDurationInput) taskDurationInput.value = '';
      if (taskNameInput) taskNameInput.focus();
    }

    updateAddTaskState = () => {
      if (!addTaskBtn) return;
      addTaskBtn.disabled = taskList.querySelectorAll('.task-item').length >= MAX_TASKS;
    };

    if (addTaskBtn) {
      addTaskBtn.addEventListener('click', createTask);
    }

    updateAddTaskState();

    // Allow Enter key to add task when focused on either input
    [taskNameInput, taskDurationInput].forEach((el) => {
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createTask();
        }
      });
    });
  }

  // ---- Search / Filter tasks ----
  function filterTasks(query) {
    const q = (query || '').trim().toLowerCase();
    const items = taskList.querySelectorAll('.task-item');
    items.forEach((item) => {
      const name = (item.dataset.taskName || item.querySelector('.task-item__name')?.textContent || '').toLowerCase();
      const matches = q === '' || name.includes(q);
      item.style.display = matches ? '' : 'none';
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      filterTasks(searchInput.value);
    });

    searchInput.addEventListener('input', (e) => {
      filterTasks(e.target.value);
    });
  }

  // ---- Custom non-blocking confirm modal ----
  const customModal = document.getElementById('confirm-modal');
  const customModalMessage = customModal && customModal.querySelector('.confirm-modal__message');
  const customModalConfirm = customModal && customModal.querySelector('.confirm-modal__btn--confirm');
  const customModalCancel = customModal && customModal.querySelector('.confirm-modal__btn--cancel');

  function showCustomConfirm(message, confirmText = 'OK') {
    return new Promise((resolve) => {
      if (!customModal) {
        // fallback
        resolve(window.confirm(message));
        return;
      }

      const previouslyFocused = document.activeElement;
      customModalMessage.textContent = message;
      if (confirmText !== 'OK') {
        // For delete confirmation
        customModalConfirm.textContent = confirmText;
      } else {
        // For validation messages
        customModalConfirm.textContent = 'OK';
      }
      customModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden'; // trap scroll

      function cleanup(result) {
        customModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = ''; // restore scroll
        customModalConfirm.removeEventListener('click', onConfirm);
        customModalCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        // restore focus
        if (previouslyFocused && previouslyFocused.focus) {
          previouslyFocused.focus();
        }
        resolve(result);
      }

      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        }
        // Tab key focus trapping
        if (e.key === 'Tab') {
          const focusableButtons = [customModalCancel, customModalConfirm];
          const currentIndex = focusableButtons.indexOf(document.activeElement);
          if (e.shiftKey) {
            // Shift+Tab: move backward
            const prevIndex = (currentIndex - 1 + focusableButtons.length) % focusableButtons.length;
            focusableButtons[prevIndex].focus();
          } else {
            // Tab: move forward
            const nextIndex = (currentIndex + 1) % focusableButtons.length;
            focusableButtons[nextIndex].focus();
          }
          e.preventDefault();
        }
      }

      customModalConfirm.addEventListener('click', onConfirm);
      customModalCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      // focus the cancel button for accessibility
      customModalCancel.focus();
    });
  }
})();
 




