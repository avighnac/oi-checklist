const apiUrl = '';
function check_session() {
  (async () => {
    let res = await fetch(`${apiUrl}/auth/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: localStorage.getItem('sessionToken') }),
    });
    if (!res.ok) {
      window.location.href = 'home';
    }
  })();
}
const olympiadIds = [
  'APIO',
  'EGOI',
  'INOI',
  'ZCO',
  'IOI',
  'JOISC',
  'JOIOC',
  'IOITC',
  'NOISEL',
  'NOIPRELIM',
  'NOIQUAL',
  'NOIFINAL',
  'JOIFR',
  'POI',
  'CEOI',
  'COI',
  'BOI',
  'USACO',
  'GKS',
  'GCPC',
  'NCPC',
  'NWERC',
  'NAQ',
  'EJOI',
  'IZHO',
  'ROI',
  'BKOI',
  'CNOI',
  'COCI',
  'RMI',
];
const auto_synced_platforms = ['oj.uz', 'qoj.ac', 'codechef'];
let yearSortOrder = 'asc';
function getFullOlympiadName(id) {
  const names = {
    APIO: 'Asia-Pacific Informatics Olympiad',
    EGOI: "European Girls' Olympiad in Informatics",
    INOI: 'Indian National Olympiad in Informatics',
    ZCO: 'Indian Zonal Computing Olympiad',
    IOI: 'International Olympiad in Informatics',
    JOIFR: 'Japanese OI \u2014 Final Round',
    JOISC: 'Japanese OI \u2014 Spring Camp',
    JOIOC: 'Japanese OI \u2014 Open Contest',
    IOITC: 'Indian IOI Training Camp',
    NOIPRELIM: 'Singapore NOI \u2014 Preliminary Round',
    NOIQUAL: 'Singapore NOI \u2014 Qualification Round',
    NOIFINAL: 'Singapore NOI \u2014 Final Round',
    NOISEL: 'Singapore NOI \u2014 Selection Test',
    POI: 'Polish Olympiad in Informatics',
    CEOI: 'Central European Olympiad in Informatics',
    COI: 'Croatian Olympiad in Informatics',
    BOI: 'Baltic Olympiad in Informatics',
    GKS: 'Google Kick Start',
    GCPC: 'German Collegiate Programming Contest',
    NCPC: 'Nordic Collegiate Programming Contest',
    NWERC: 'Northwestern Europe Regional Contest',
    NAQ: 'North America Qualifier',
    USACO: 'USA Computing Olympiad',
    EJOI: 'European Junior Olympiad in Informatics',
    IZHO: 'International Zhautykov Olympiad',
    ROI: 'Russian Olympiad in Informatics',
    BKOI: 'Balkan Olympiad in Informatics',
    CNOI: 'Chinese National Olympiad in Informatics',
    COCI: 'Croatian Open Competition in Informatics',
    RMI: 'Romanian Master of Informatics',
    USACOBRONZE: 'USACO Bronze',
    USACOSILVER: 'USACO Silver',
    USACOGOLD: 'USACO Gold',
    USACOPLATINUM: 'USACO Platinum',
  };
  return names[id] || id;
}
function applyOlympiadContainerOrder(order) {
  const container = document.getElementById('olympiad-list');
  const allSections = Array.from(container.children);
  const sectionMap = /* @__PURE__ */ new Map();
  allSections.forEach((section) => {
    const id = section.id.replace('-container', '').toLowerCase();
    sectionMap.set(id, section);
  });
  container.innerHTML = '';
  const seen = /* @__PURE__ */ new Set();
  for (const id of order) {
    const section = sectionMap.get(id.toLowerCase());
    if (section) {
      container.appendChild(section);
      seen.add(id.toLowerCase());
    }
  }
  for (const [id, section] of sectionMap.entries()) {
    if (!seen.has(id)) {
      container.appendChild(section);
    }
  }
}
function generateSkeletonRows(numRows) {
  let skeletonHTML = '';
  for (let i = 0; i < numRows; i++) {
    skeletonHTML += `
      <tr class="skeleton-row">
        <td class="year-cell skeleton"></td>
        <td class="problem-cell skeleton"></td>
        <td class="problem-cell skeleton"></td>
        <td class="problem-cell skeleton"></td>
      </tr>
    `;
  }
  return skeletonHTML;
}
function getPlatformFromLink(link) {
  if (!link) return 'Unknown';
  try {
    return new URL(link).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return 'Unknown';
  }
}
function formatDuration(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${remainingMinutes} minutes`;
  } else if (remainingMinutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  } else {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} minutes`;
  }
}
const statuses = [
  { label: 'Unattempted', className: 'white', value: 0 },
  { label: 'In progress', className: 'yellow', value: 1 },
  { label: 'Solved', className: 'green', value: 2 },
  { label: 'Failed', className: 'red', value: 3 },
];
const next = [1, 3, 0, 2];
let currentCell = null;
let currentStatus = 0;
let isProfileMode = false;
let documentClickHandlerAdded = false;
function addGlobalClickHandler() {
  if (documentClickHandlerAdded) return;
  document.addEventListener('click', (e) => {
    const popup = document.getElementById('status-popup');
    if (!popup) return;
    const isInsidePopup = popup.contains(e.target);
    const isSameCell = currentCell && currentCell.contains(e.target);
    if (!isInsidePopup && !isSameCell && popup.classList.contains('show')) {
      popup.classList.remove('show');
      popup.classList.add('hidden');
      if (currentCell) {
        handlePopupClose(currentCell);
        currentCell = null;
      }
    }
  });
  documentClickHandlerAdded = true;
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addGlobalClickHandler);
} else {
  addGlobalClickHandler();
}
function triggerFullConfettiFall() {
  const particleBursts = 40;
  for (let i = 0; i < particleBursts; i++) {
    confetti({
      particleCount: 5,
      angle: 270,
      spread: 180,
      startVelocity: 20,
      gravity: 1.8,
      ticks: 1e3,
      scalar: 1.5,
      zIndex: 1e3,
      origin: { x: Math.random(), y: 0 },
    });
  }
}
function handleCellClick(cell, name, source, year, e) {
  if (e.target.tagName.toLowerCase() === 'a') return;
  const popup = document.getElementById('status-popup');
  const popupStatus = document.getElementById('popup-status');
  const popupScore = document.getElementById('popup-score');
  if (currentCell === cell && popup.classList.contains('show')) {
    handlePopupClose(currentCell);
    popup.classList.remove('show');
    currentCell = null;
    return;
  }
  if (popup.classList.contains('show')) {
    handlePopupClose(currentCell);
    popup.classList.remove('show');
  }
  currentCell = cell;
  let parsedStatus = Number.parseInt(cell.dataset.status ?? '0', 10);
  if (
    !Number.isFinite(parsedStatus) ||
    parsedStatus < 0 ||
    parsedStatus >= statuses.length
  ) {
    parsedStatus = 0;
    cell.dataset.status = '0';
  }
  currentStatus = parsedStatus;
  const statusObj = statuses[currentStatus] ?? statuses[0];
  popupStatus.textContent = statusObj.label;
  popupStatus.dataset.status = statusObj.label;
  popupStatus.classList.remove('green', 'yellow', 'red', 'white');
  if (statusObj.className !== 'white') {
    popupStatus.classList.add(statusObj.className);
  }
  popupScore.textContent = cell.dataset.score || '0';
  const rect = cell.getBoundingClientRect();
  popup.style.top = `${window.scrollY + rect.bottom + 5}px`;
  popup.style.left = `${window.scrollX + rect.left + rect.width / 2 - 60}px`;
  popup.classList.remove('hidden');
  setTimeout(() => popup.classList.add('show'), 10);
  popupScore.focus();
  const range = document.createRange();
  range.selectNodeContents(popupScore);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const thisCell = cell;
  const thisName = name;
  const thisSource = source;
  const thisYear = parseInt(year);
  popupStatus.onclick = () => {
    if (isProfileMode) return;
    currentStatus = next[currentStatus];
    updateStatus(currentStatus, thisCell, thisName, thisSource, thisYear);
    if (currentStatus == 2) {
      triggerFullConfettiFall();
    }
  };
  popupScore.onblur = () => {
    if (isProfileMode) return;
    let raw = popupScore.textContent.trim();
    let score = parseFloat(raw);
    if (isNaN(score)) score = 0;
    score = Math.round(score * 100) / 100;
    score = Math.max(0, Math.min(score, 100));
    let prevScore = parseFloat(thisCell.dataset.score) || 0;
    let scoreChanged = Math.abs(prevScore - score) > 1e-3;
    thisCell.dataset.score = score;
    popupScore.textContent = score;
    if (scoreChanged && score == 100) {
      triggerFullConfettiFall();
    }
    if (scoreChanged && score != 100 && prevScore != 0) {
      popupScore.classList.add('bump');
      setTimeout(() => popupScore.classList.remove('bump'), 250);
    }
    if (score === 100) {
      currentStatus = 2;
      updateStatus(currentStatus, thisCell, thisName, thisSource, thisYear);
    } else if (score > 0 && scoreChanged) {
      currentStatus = 1;
      updateStatus(currentStatus, thisCell, thisName, thisSource, thisYear);
    }
    if (!window.isVirtualContestMode) {
      const sessionToken = localStorage.getItem('sessionToken');
      const problemId = Number.parseInt(cell.dataset.id, 10);
      if (Number.isFinite(problemId)) {
        fetch(apiUrl + '/user/problems', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: sessionToken, id: problemId, score }),
        });
      }
    }
  };
  popupScore.addEventListener('keypress', (e2) => {
    if (isProfileMode) {
      e2.preventDefault();
      return;
    }
    if (!/[0-9.]/.test(e2.key) && e2.key !== 'Enter') {
      e2.preventDefault();
    }
    if (e2.key === '.' && popupScore.textContent.includes('.')) {
      e2.preventDefault();
    }
    if (e2.key === 'Enter') {
      e2.preventDefault();
      popupScore.blur();
    }
  });
}
function updateStatus(status, cell, name, source, year) {
  const statusObj = statuses[status] ?? statuses[0];
  cell.dataset.status = String(status);
  cell.classList.remove('green', 'yellow', 'red', 'white');
  if (statusObj.className) {
    cell.classList.add(statusObj.className);
  }
  const popup = document.getElementById('status-popup');
  const popupStatus = document.getElementById('popup-status');
  if (popup && popupStatus) {
    popupStatus.textContent = statusObj.label;
    popupStatus.dataset.status = statusObj.label;
    popupStatus.classList.remove('green', 'yellow', 'red', 'white');
    if (statusObj.className != 'white') {
      popupStatus.classList.add(statusObj.className);
    }
  }
  if (!window.isVirtualContestMode) {
    const sessionToken = localStorage.getItem('sessionToken');
    const problemId = Number.parseInt(cell.dataset.id, 10);
    if (Number.isFinite(problemId)) {
      fetch(apiUrl + '/user/problems', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: sessionToken, id: problemId, status }),
      });
    }
  }
}
function handlePopupClose(cell) {
  if (isProfileMode) return;
  const score = parseFloat(cell.dataset.score) || 0;
  let status = Number.parseInt(cell.dataset.status ?? '0', 10);
  if (!Number.isFinite(status)) status = 0;
  const name = cell.dataset.problemId;
  const source = cell.dataset.source;
  const year = parseInt(cell.dataset.year);
  const problemId = Number.parseInt(cell.dataset.id, 10);
  if (!Number.isFinite(problemId)) return;
  if (status === 2 || status === 0) {
    const finalScore = status === 2 ? 100 : 0;
    if (Math.abs(parseFloat(cell.dataset.score) - finalScore) < 1e-3) {
      return;
    }
    cell.dataset.score = String(finalScore);
    const popupScore = document.getElementById('popup-score');
    if (popupScore) {
      popupScore.textContent = finalScore;
    }
    if (!window.isVirtualContestMode) {
      const sessionToken = localStorage.getItem('sessionToken');
      fetch(apiUrl + '/user/problems', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: sessionToken,
          id: problemId,
          score: finalScore,
        }),
      });
    }
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  const logout_button = document.getElementById('logout-button');
  if (!logout_button) return;
  logout_button.addEventListener('click', async (event) => {
    event.preventDefault();
    const token = localStorage.getItem('sessionToken');
    localStorage.removeItem('sessionToken');
    const res = await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.status === 200) {
      window.location.href = 'home';
    } else {
      console.error('Logout failed');
    }
  });
});
document.addEventListener('DOMContentLoaded', function () {
  const toggleSwitch = document.getElementById('dark-mode-switch');
  const themeSelector = document.getElementById('theme-selector');
  if (!toggleSwitch) {
    let currentTheme2 = localStorage.getItem('theme') || 'lightClassic';
    if (
      currentTheme2 === 'darkClassic' ||
      currentTheme2 === 'darkMuted' ||
      currentTheme2 === 'dark-mode'
    ) {
      document.body.classList.add('dark-mode');
      document.documentElement.classList.add('dark-mode');
    }
    return;
  }
  let currentTheme = localStorage.getItem('theme') || 'lightClassic';
  let selectedDarkTheme =
    localStorage.getItem('selectedDarkTheme') || 'darkClassic';
  if (currentTheme === 'dark-mode') {
    currentTheme = 'darkClassic';
    localStorage.setItem('theme', 'darkClassic');
    localStorage.setItem('selectedDarkTheme', 'darkClassic');
  }
  if (currentTheme === 'darkClassic' || currentTheme === 'darkMuted') {
    document.body.classList.add('dark-mode');
    document.documentElement.classList.add('dark-mode');
    toggleSwitch.checked = true;
  }
  if (themeSelector) {
    themeSelector.value = currentTheme;
    themeSelector.addEventListener('change', function (e) {
      const newTheme = e.target.value;
      localStorage.setItem('theme', newTheme);
      if (newTheme === 'darkClassic' || newTheme === 'darkMuted') {
        localStorage.setItem('selectedDarkTheme', newTheme);
        document.body.classList.add('dark-mode');
        document.documentElement.classList.add('dark-mode');
        toggleSwitch.checked = true;
      } else {
        document.body.classList.remove('dark-mode');
        document.documentElement.classList.remove('dark-mode');
        toggleSwitch.checked = false;
      }
    });
  }
  toggleSwitch.addEventListener('change', function (e) {
    if (e.target.checked) {
      const darkTheme =
        localStorage.getItem('selectedDarkTheme') || 'darkClassic';
      document.body.classList.add('dark-mode');
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', darkTheme);
      if (typeof darkModeCss === 'function') {
        darkModeCss();
      }
      if (themeSelector) {
        themeSelector.value = darkTheme;
      }
    } else {
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'lightClassic');
      if (themeSelector) {
        themeSelector.value = 'lightClassic';
      }
    }
  });
});
