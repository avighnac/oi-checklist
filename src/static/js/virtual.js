let problemsData = {};
function convertData(newData) {
  if (!newData) return null;
  const contestsDict = {};
  for (const contest of newData.contests || []) {
    const source = contest.source?.toUpperCase?.() || contest.source || '';
    const year = contest.year;
    if (!contestsDict[source]) contestsDict[source] = {};
    if (!contestsDict[source][year]) contestsDict[source][year] = [];
    const c = {
      name: contest.name,
      stage: contest.stage || null,
      source,
      year,
      duration_minutes: contest.duration ?? null,
      location: contest.location ?? '',
      website: contest.website ?? '',
      link: contest.link ?? '',
      date: contest.date ?? '',
      notes: contest.note ?? '',
      problems: (contest.problems || []).map((p) => ({
        source,
        year: contest.year,
        problemId: p.problemId,
        index: p.problemIndex + 1,
        ...(p.extra ? { extra: p.extra } : {}),
      })),
    };
    contestsDict[source][year].push(c);
  }
  let activeContest = null;
  if (newData.activeContest) {
    const ac = newData.activeContest;
    activeContest = {
      id: ac.contestId,
      contest_name: ac.contest.name ?? '',
      contest_stage: ac.contest.stage ?? '',
      start_time: ac.startedAt ?? null,
      end_time: ac.endedAt ?? null,
      autosynced: ac.autosynced ?? false,
      duration_minutes: ac.contest.duration ?? null,
      location: ac.contest.location ?? '',
      website: ac.contest.website ?? '',
      link: ac.contest.link ?? '',
      ojuz_data: ac.submissions ?? ac.ojuz_data ?? [],
    };
  }
  const recent = (newData.recent || []).map((v) => ({
    contest_name: v.contest?.name ?? v.name ?? '',
    contest_stage: v.contest?.stage ?? v.stage ?? '',
    contest_source: v.contest?.source ?? v.source ?? '',
    contest_year: v.contest?.year ?? v.year ?? '',
    started_at: v.started_at ?? v.startedAt ?? null,
    score: v.total_score ?? v.score ?? null,
    per_problem_scores: v.per_problem_scores ?? v.perProblemScores ?? null,
    platform:
      v.platform ?? (v.contest?.link?.includes('oj.uz') ? 'oj.uz' : 'manual'),
  }));
  const completed_contests = newData.completedContests || [];
  const result = {
    contests: contestsDict,
    recent,
    completed_contests,
  };
  if (activeContest) {
    activeContest.problems = newData.contests.find(
      (i) => i.id == activeContest.id,
    ).problems;
    result.active_contest = activeContest;
  }
  return result;
}
function formatContestSourceDisplay(contestSource) {
  const upperSource = contestSource.toUpperCase();
  if (
    ['USACOSILVER', 'USACOBRONZE', 'USACOPLATINUM', 'USACOGOLD'].includes(
      upperSource,
    )
  ) {
    const division = upperSource.replace('USACO', '');
    const capitalizedDivision =
      division.charAt(0).toUpperCase() + division.slice(1).toLowerCase();
    return `USACO ${capitalizedDivision}`;
  }
  return upperSource;
}
document.addEventListener('DOMContentLoaded', async () => {
  let lastRenderedContest = null;
  let lastRenderedOlympiad = null;
  let lastProblemCount = 0;
  window.isVirtualContestMode = true;
  const olympiadSelect = document.getElementById('olympiad-select');
  const divisionSelect = document.getElementById('division-select');
  const contestSelect = document.getElementById('contest-select');
  const daySelect = document.getElementById('day-select');
  const contestDetails = document.getElementById('contest-details');
  const ojuzSection = document.getElementById('ojuz-section');
  const startBtn = document.getElementById('start-contest-btn');
  const vcForm = document.querySelector('.vc-form');
  const activeContest = document.getElementById('active-contest');
  const scoreEntry = document.getElementById('score-entry');
  const pastVcList = document.querySelector('.past-vc-list');
  const sessionToken = localStorage.getItem('sessionToken');
  function asBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    }
    return false;
  }
  document.getElementById('past-vc-loading').style.display = 'block';
  pastVcList.style.display = 'none';
  document.querySelector('.view-all-link').style.display = 'none';
  const contestOngoing = localStorage.getItem('contest_ongoing') === 'true';
  if (contestOngoing) {
    document.getElementById('vc-main-loading').style.display = 'block';
    document.getElementById('vc-main-loading').className =
      'vc-main-loading active-contest-skeleton';
  } else {
    document.getElementById('vc-main-loading').style.display = 'block';
    document.getElementById('vc-main-loading').className =
      'vc-main-loading form-skeleton';
  }
  vcForm.style.display = 'none';
  activeContest.style.display = 'none';
  scoreEntry.style.display = 'none';
  check_session();
  const username = localStorage.getItem('username');
  document.getElementById('welcome-message').innerHTML = `Welcome, ${username}`;
  const currentUserName = username;
  const response = await fetch(`${apiUrl}/data/virtual/summary`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: sessionToken }),
  });
  if (!response.ok) {
    console.error('Failed to fetch virtual contests data');
    document.getElementById('past-vc-loading').style.display = 'none';
    return;
  }
  const data = convertData(await response.json());
  let contestData = data.contests;
  const problemsResponse = await fetch(`${apiUrl}/data/problems`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: Object.keys(contestData).map((i) => i.toLowerCase()),
      token: sessionToken,
      allLinks: true,
    }),
  });
  if (problemsResponse.ok) {
    problemsData = await problemsResponse.json();
  }
  let flatData = [];
  for (let [source, years] of Object.entries(problemsData)) {
    for (let [year, data2] of Object.entries(years)) {
      flatData.push(data2);
    }
  }
  flatData = flatData.flat();
  for (let [source, years] of Object.entries(data.contests)) {
    for (let [year, data2] of Object.entries(years)) {
      for (let contest of data2) {
        for (let problem2 of contest.problems) {
          problem2.number = flatData.find(
            (i) => i.id == problem2.problemId,
          ).number;
        }
      }
    }
  }
  contestData = data.contests;
  const completedContestKeys = new Set(
    (data.completed_contests || []).map(String),
  );
  let currentActiveContest = null;
  function showMessage(text, type = 'error') {
    const messageContainer = document.getElementById('message-container');
    const messageContent = document.getElementById('message-content');
    const messageText = document.getElementById('message-text');
    messageText.textContent = text;
    messageContent.className = `message-content ${type}`;
    messageContainer.style.display = 'flex';
    setTimeout(() => {
      messageContainer.classList.add('show');
    }, 10);
  }
  function showLinks(links) {
    const messageContainer = document.getElementById('message-container');
    const messageContent = document.getElementById('message-content');
    const messageText = document.getElementById('message-text');
    messageText.innerHTML = `<div style="font-weight:600;margin-bottom:0.5em">
    Open the contest problems below:
  </div>`;
    const table = document.createElement('table');
    table.className = 'problems-table links-table';
    const row = document.createElement('tr');
    links.forEach((problem2) => {
      const cell = document.createElement('td');
      cell.className = 'problem-cell';
      const content = document.createElement('div');
      content.className = 'problem-cell-content';
      const link = document.createElement('a');
      link.href = problem2.link;
      link.target = '_blank';
      link.textContent = problem2.name;
      content.appendChild(link);
      cell.appendChild(content);
      row.appendChild(cell);
    });
    table.appendChild(row);
    messageText.appendChild(table);
    messageContent.className = 'message-content info';
    messageContainer.style.display = 'flex';
    setTimeout(() => messageContainer.classList.add('show'), 10);
  }
  function hideMessage() {
    const messageContainer = document.getElementById('message-container');
    messageContainer.classList.remove('show');
    setTimeout(() => {
      messageContainer.style.display = 'none';
    }, 300);
  }
  document
    .getElementById('message-close')
    .addEventListener('click', hideMessage);
  document
    .getElementById('message-container')
    .addEventListener('click', (e) => {
      if (e.target.id === 'message-container') {
        hideMessage();
      }
    });
  function getPlatformPrefList() {
    try {
      const s = localStorage.getItem('platformPref');
      if (!s) return null;
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
  function chooseUrlFromLinksDict(linksDict) {
    if (!linksDict || typeof linksDict !== 'object') return null;
    const pref = getPlatformPrefList();
    if (pref && pref.length) {
      for (const plat of pref) {
        if (linksDict[plat]) return linksDict[plat];
      }
    }
    const first = Object.values(linksDict)[0];
    return first || null;
  }
  function chooseProblemUrl(problem2) {
    if (!problem2) return null;
    if (problem2.links) return chooseUrlFromLinksDict(problem2.links);
    return problem2.link || null;
  }
  function showScoreEntry(isReadOnly = false) {
    if (!currentActiveContest) {
      showMessage('No active contest data available.');
      return;
    }
    const contestTitle = currentActiveContest.contest_stage
      ? `${currentActiveContest.contest_name} ${currentActiveContest.contest_stage}`
      : currentActiveContest.contest_name;
    document.getElementById('score-contest-title').textContent = contestTitle;
    const startTime = new Date(currentActiveContest.start_time);
    let endTime;
    if (currentActiveContest.end_time) {
      endTime = new Date(currentActiveContest.end_time);
    } else {
      endTime = /* @__PURE__ */ new Date();
    }
    const contestDurationMs = currentActiveContest.duration_minutes * 60 * 1e3;
    const maxEndTime = new Date(startTime.getTime() + contestDurationMs);
    const cappedEndTime = new Date(
      Math.min(endTime.getTime(), maxEndTime.getTime()),
    );
    const elapsedMilliseconds = cappedEndTime - startTime;
    const elapsedMinutes = Math.floor(elapsedMilliseconds / (1e3 * 60));
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    const remainingMinutes = elapsedMinutes % 60;
    const timeUsed =
      elapsedHours > 0
        ? `${elapsedHours}h ${remainingMinutes}m`
        : `${remainingMinutes}m`;
    document.getElementById('completion-time').textContent = timeUsed;
    const scoreSection = document.querySelector('.score-section');
    const scoreSectionH3 = scoreSection.querySelector('h3');
    const scoreSubtitle = document.querySelector('.score-subtitle');
    if (isReadOnly) {
      scoreSectionH3.textContent = 'View Your Scores';
      scoreSubtitle.textContent =
        'Click on each problem to view detailed scoring information.';
    } else {
      scoreSectionH3.textContent = 'Enter Your Scores';
      scoreSubtitle.textContent = 'Click on each problem to set your score.';
    }
    const contestName = currentActiveContest.contest_name;
    const contestStage = currentActiveContest.contest_stage;
    let contestProblems = [];
    let problemCount = 3;
    for (const [olympiad, years] of Object.entries(contestData)) {
      for (const [year, contests] of Object.entries(years)) {
        const contest = contests.find(
          (c) =>
            c.name === contestName &&
            (contestStage ? c.stage === contestStage : c.stage == null),
        );
        if (contest && contest.problems) {
          contestProblems = contest.problems;
          problemCount = contest.problems.length;
          break;
        }
      }
      if (contestProblems.length > 0) break;
    }
    function calculateScore(data2, n) {
      let arr = [];
      for (let i = 0; i < n; ++i) {
        arr.push([]);
      }
      if (!data2) {
        return arr;
      }
      const uniqueIds = [...new Set(data2.map((d) => d.contestProblemId))].sort(
        (a, b) => a - b,
      );
      const idMap = Object.fromEntries(uniqueIds.map((id, idx) => [id, idx]));
      data2 = data2.map((entry) => ({
        ...entry,
        problemIndex: idMap[entry.contestProblemId],
      }));
      for (let submission of data2) {
        let cur = arr[submission.problemIndex] ?? [];
        for (let i = 0; i < submission.subtaskScores.length; ++i) {
          cur[i] = Math.max(cur[i] ?? 0, submission.subtaskScores[i]);
        }
        arr[submission.problemIndex] = cur;
      }
      return arr;
    }
    function calculateTotalScore(data2) {
      return data2.reduce((sum, a) => sum + a.reduce((a2, b) => a2 + b, 0), 0);
    }
    if (isReadOnly && currentActiveContest.autosynced) {
      const scoreData = calculateScore(
        currentActiveContest.ojuz_data,
        currentActiveContest.problems.length,
      );
      const totalScore = calculateTotalScore(scoreData);
      const completionStats = document.querySelector('.completion-stats');
      let totalScoreStat = document.getElementById('total-score-stat');
      if (!totalScoreStat) {
        totalScoreStat = document.createElement('div');
        totalScoreStat.id = 'total-score-stat';
        totalScoreStat.className = 'stat-item';
        totalScoreStat.innerHTML = `
          <span class="stat-label">Total Score:</span>
          <span class="stat-value" id="total-score-value">${totalScore}/${problemCount * 100}</span>
        `;
        completionStats.appendChild(totalScoreStat);
      } else {
        document.getElementById('total-score-value').textContent =
          `${totalScore}/${problemCount * 100}`;
      }
    }
    const scoreTbody = document.getElementById('score-problems-tbody');
    scoreTbody.innerHTML = '';
    const problemData = [];
    if (contestProblems.length > 0 && problemsData) {
      contestProblems.forEach((prob, index) => {
        const olympiadProblems = problemsData[prob.source];
        if (olympiadProblems && olympiadProblems[prob.year]) {
          const problem2 = olympiadProblems[prob.year].find(
            (p) => p.id === prob.problemId,
          );
          if (problem2) {
            problemData.push({
              id: problem2.id,
              name: problem2.name,
              link: chooseProblemUrl(problem2) || '#',
              source: prob.source,
              year: prob.year,
              score: 0,
              status: 0,
              index: prob.index,
            });
          } else {
            problemData.push({
              id: `unknown_${index}`,
              name: `Problem ${index + 1}`,
              link: '#',
              source: prob.source,
              year: prob.year,
              score: 0,
              status: 0,
              index: prob.index,
            });
          }
        } else {
          problemData.push({
            id: problem.id,
            name: `Problem ${index + 1}`,
            link: '#',
            source: prob.source,
            year: prob.year,
            score: 0,
            status: 0,
            index: prob.index,
          });
        }
      });
    } else {
      for (let i = 1; i <= problemCount; i++) {
        problemData.push({
          id: -1,
          name: `Problem ${i}`,
          link: '#',
          source: 'Unknown',
          year: /* @__PURE__ */ new Date().getFullYear(),
          score: 0,
          status: 0,
          index: i,
        });
      }
    }
    if (currentActiveContest.ojuz_data) {
      currentActiveContest.ojuz_data = currentActiveContest.ojuz_data.map(
        (i) => {
          const problem2 = currentActiveContest.problems.find(
            (j) => j.id == i.contestProblemId,
          );
          i.problemIndex = problem2.problemIndex;
          return i;
        },
      );
    }
    if (isReadOnly && currentActiveContest.autosynced) {
      const scoreData = calculateScore(
        currentActiveContest.ojuz_data,
        currentActiveContest.problems.length,
      );
      for (
        let problemIndex = 0;
        problemIndex < scoreData.length;
        ++problemIndex
      ) {
        problemData[problemIndex].score = scoreData[problemIndex].reduce(
          (a, b) => a + b,
          0,
        );
        problemData[problemIndex].subtaskScores = scoreData[problemIndex];
        if (problemData[problemIndex].score == 100) {
          problemData[problemIndex].status = 2;
        } else if (problemData[problemIndex].score > 0) {
          problemData[problemIndex].status = 1;
        } else {
          problemData[problemIndex].status = 0;
        }
      }
    }
    const row = document.createElement('tr');
    problemData.forEach((problem2, index) => {
      const cell = document.createElement('td');
      cell.className = `problem-cell ${getStatusColor(problem2.status)}`;
      cell.dataset.id = problem2.id.toString();
      cell.dataset.status = problem2.status.toString();
      cell.dataset.problemId = problem2.name;
      cell.dataset.source = problem2.source;
      cell.dataset.year = problem2.year;
      cell.dataset.score = problem2.score.toString();
      cell.dataset.readOnly = isReadOnly.toString();
      if (isReadOnly) {
        cell.dataset.subtaskScores = JSON.stringify(
          problem2.subtaskScores || [],
        );
        cell.dataset.submissionTime = problem2.time || '';
      }
      const cellContent = document.createElement('div');
      cellContent.className = 'problem-cell-content';
      const link = document.createElement('a');
      link.href = problem2.link || '#';
      link.target = '_blank';
      link.textContent = problem2.name;
      cellContent.appendChild(link);
      cell.appendChild(cellContent);
      if (isReadOnly) {
        cell.addEventListener('click', (e) =>
          handleReadOnlyCellClick(cell, problem2, e),
        );
      } else {
        cell.addEventListener('click', (e) =>
          handleCellClick(
            cell,
            problem2.name,
            problem2.source,
            problem2.year,
            e,
          ),
        );
      }
      row.appendChild(cell);
    });
    scoreTbody.appendChild(row);
    activeContest.style.display = 'none';
    scoreEntry.style.display = 'block';
  }
  function showForm() {
    localStorage.setItem('contest_ongoing', 'false');
    document.getElementById('vc-main-loading').style.display = 'none';
    olympiadSelect.value = '';
    divisionSelect.innerHTML = '<option value="">Select Division</option>';
    contestSelect.innerHTML = '<option value="">Select Contest</option>';
    daySelect.innerHTML = '<option value="">Select Day</option>';
    divisionSelect.disabled = true;
    contestSelect.disabled = true;
    daySelect.disabled = true;
    contestDetails.style.display = 'none';
    ojuzSection.style.display = 'none';
    startBtn.disabled = true;
    vcForm.style.display = 'block';
    activeContest.style.display = 'none';
    scoreEntry.style.display = 'none';
  }
  const contestSources = Object.keys(contestData);
  if (data.active_contest) {
    currentActiveContest = data.active_contest;
    currentActiveContest.autosynced = asBool(currentActiveContest.autosynced);
    localStorage.setItem('contest_ongoing', 'true');
    document.getElementById('vc-main-loading').style.display = 'none';
    if (currentActiveContest.end_time) {
      localStorage.setItem('contest_ongoing', 'false');
      vcForm.style.display = 'none';
      document.getElementById('active-contest').style.display = 'none';
      const wasSynced = localStorage.getItem('is_synced') === 'true';
      const hasOjuzData =
        currentActiveContest.ojuz_data &&
        currentActiveContest.ojuz_data.length > 0;
      if (wasSynced && !hasOjuzData) {
        const storedOjuzData = localStorage.getItem('ojuz_data');
        if (storedOjuzData) {
          try {
            currentActiveContest.ojuz_data = JSON.parse(storedOjuzData);
          } catch (e) {
            console.error('Failed to parse stored oj.uz data:', e);
          }
        }
      }
      showScoreEntry(currentActiveContest.autosynced);
    } else {
      vcForm.style.display = 'none';
      document.getElementById('active-contest').style.display = 'block';
      const titleText = currentActiveContest.contest_stage
        ? `${currentActiveContest.contest_name} <svg width="12" height="3" viewBox="0 0 12 3" style="vertical-align: middle; margin: 0 4px;"><rect width="12" height="2" fill="currentColor"/></svg> ${currentActiveContest.contest_stage}`
        : currentActiveContest.contest_name;
      document.getElementById('active-contest-title').innerHTML = titleText;
      const locationElement = document.getElementById(
        'active-contest-location',
      );
      const websiteElement = document.getElementById('active-contest-website');
      if (currentActiveContest.location || currentActiveContest.website) {
        let metadataHTML = '';
        if (currentActiveContest.location) {
          metadataHTML += currentActiveContest.location;
        }
        if (currentActiveContest.website) {
          if (metadataHTML) metadataHTML += ' | ';
          metadataHTML += `<a href="${currentActiveContest.website}" target="_blank">${currentActiveContest.website}</a>`;
        }
        locationElement.innerHTML = metadataHTML;
        locationElement.style.display = 'block';
        websiteElement.style.display = 'none';
      } else {
        locationElement.style.display = 'none';
        websiteElement.style.display = 'none';
      }
      const startTime = new Date(currentActiveContest.start_time);
      const now = /* @__PURE__ */ new Date();
      const elapsedMilliseconds = now - startTime;
      const elapsedSeconds = Math.floor(elapsedMilliseconds / 1e3);
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      const maxElapsedSeconds = currentActiveContest.duration_minutes * 60;
      const cappedElapsedSeconds = Math.min(elapsedSeconds, maxElapsedSeconds);
      const remainingSeconds = Math.max(
        0,
        maxElapsedSeconds - cappedElapsedSeconds,
      );
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      startTimerWithSeconds(remainingSeconds, cappedElapsedSeconds);
    }
  }
  if (!currentActiveContest) {
    localStorage.setItem('contest_ongoing', 'false');
    document.getElementById('vc-main-loading').style.display = 'none';
    vcForm.style.display = 'block';
    olympiadSelect.innerHTML = '<option value="">Select Olympiad</option>';
    const usacoDivisions = [];
    const otherOlympiads = [];
    Object.keys(contestData).forEach((source) => {
      if (
        ['USACOSILVER', 'USACOBRONZE', 'USACOPLATINUM', 'USACOGOLD'].includes(
          source,
        )
      ) {
        usacoDivisions.push(source);
      } else {
        otherOlympiads.push(source);
      }
    });
    const allOptions = [];
    if (usacoDivisions.length > 0) {
      allOptions.push({
        value: 'USACO_COMBINED',
        text: 'USA Computing Olympiad',
      });
    }
    otherOlympiads.forEach((source) => {
      allOptions.push({
        value: source,
        text: getFullOlympiadName(source),
      });
    });
    allOptions.sort((a, b) => a.text.localeCompare(b.text));
    allOptions.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      olympiadSelect.appendChild(option);
    });
  }
  document.getElementById('past-vc-loading').style.display = 'none';
  pastVcList.style.display = 'block';
  document.querySelector('.view-all-link').style.display = 'block';
  pastVcList.innerHTML = '';
  const viewAllLink = document.querySelector('.view-all-link');
  if (data.recent.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'past-vc-empty';
    emptyMessage.innerHTML = `
      <div class="empty-text">No virtual contests yet.</div>
      <div class="empty-subtext">Start your first one here.</div>
    `;
    pastVcList.appendChild(emptyMessage);
    viewAllLink.style.display = 'none';
  } else {
    data.recent.forEach((contest) => {
      const item = document.createElement('div');
      item.className = 'past-vc-item';
      const date = new Date(contest.started_at);
      const numProblems = contest.per_problem_scores.length;
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      item.innerHTML = `
              <div class="past-vc-title">${formatContestSourceDisplay(contest.contest_source)} ${contest.contest_year}${contest.contest_stage ? ` ${contest.contest_stage}` : ''}</div>
              <div class="past-vc-score">${contest.score}/${numProblems * 100}</div>
              <div class="past-vc-date">${formattedDate}</div>
          `;
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' || e.target.closest('a')) {
          return;
        }
        const slug = (contest.contest_name + (contest.contest_stage || ''))
          .toLowerCase()
          .replace(/\s+/g, '');
        window.location.href = `virtual-contest-detail?contest=${slug}`;
      });
      pastVcList.appendChild(item);
    });
    viewAllLink.style.display = 'block';
  }
  function buildPlatformIndexMap(contest, selectedOlympiad) {
    const map = {};
    if (!contest || !contest.problems || !problemsData[selectedOlympiad])
      return map;
    contest.problems.forEach((prob) => {
      const yearProblems = problemsData[selectedOlympiad][prob.year] || [];
      const problem2 = yearProblems.find(
        (p) => p.id === prob.problemId,
      );
      if (problem2) {
        if (problem2 && problem2.links && typeof problem2.links === 'object') {
          Object.keys(problem2.links).forEach((plat) => {
            if (!map[plat]) map[plat] = /* @__PURE__ */ new Set();
            const idx =
              typeof prob.index === 'number' && prob.index > 0
                ? prob.index
                : map[plat].size + 1;
            map[plat].add(idx);
          });
        } else if (problem2) {
          const url = problem2.link || chooseProblemUrl(problem2);
          if (url) {
            const platform = getPlatformFromLink(url);
            if (!map[platform]) map[platform] = /* @__PURE__ */ new Set();
            const idx =
              typeof prob.index === 'number' && prob.index > 0
                ? prob.index
                : map[platform].size + 1;
            map[platform].add(idx);
          }
        }
      }
    });
    return map;
  }
  async function fetchActiveUsernamesForSync(token) {
    try {
      const settingsRes = await fetch(`${apiUrl}/user/settings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      if (!settingsRes.ok) return {};
      const settings = await settingsRes.json();
      return settings && typeof settings.platformUsernames === 'object'
        ? settings.platformUsernames
        : {};
    } catch (e) {
      console.error('Failed to fetch active platform usernames', e);
      return {};
    }
  }
  async function precheckCoverageAfterSelection(contest, selectedOlympiad) {
    const completionWarning = document.getElementById('completion-warning');
    const autoTrackEl = document.getElementById('ojuz-autotrack');
    if (!autoTrackEl || !autoTrackEl.checked) return;
    const contestKey = contest
      ? `${contest.name}|${contest.stage || ''}`
      : null;
    const isCompleted = contestKey
      ? completedContestKeys.has(contestKey) ||
        completionWarning?.dataset?.reason === 'completed'
      : false;
    if (isCompleted) return;
    const _active = await fetchActiveUsernamesForSync(sessionToken);
    const activeUsernames =
      _active && typeof _active === 'object' ? _active : {};
    const hasAnyUsername =
      Array.isArray(auto_synced_platforms) &&
      auto_synced_platforms.some((p) => activeUsernames && activeUsernames[p]);
    let missingCoverage = false;
    if (contest?.problems && problemsData[selectedOlympiad]) {
      for (const prob of contest.problems) {
        const yearProblems = problemsData[selectedOlympiad][prob.year] || [];
        const problem2 = yearProblems.find(
          (p) => p.id === prob.problemId,
        );
        if (problem2) {
          let availablePlats = [];
          if (problem2.links && typeof problem2.links === 'object') {
            availablePlats = Object.keys(problem2.links);
          } else if (problem2.link) {
            availablePlats = [getPlatformFromLink(problem2.link)];
          }
          const ok = availablePlats.some(
            (plat) =>
              auto_synced_platforms.includes(plat) && activeUsernames[plat],
          );
          if (!ok) {
            missingCoverage = true;
            break;
          }
        }
      }
    }
    if (!autoTrackEl.checked) return;
    if (!isCompleted && hasAnyUsername && missingCoverage) {
      completionWarning.textContent =
        'At least one problem has no coverage for your connected usernames.';
      completionWarning.dataset.reason = 'coverage';
      completionWarning.style.display = 'block';
      startBtn.disabled = true;
    } else if (completionWarning.dataset.reason === 'coverage') {
      completionWarning.dataset.reason = '';
      completionWarning.style.display = 'none';
      startBtn.disabled = false;
    }
  }
  function renderPlatformSyncCard(
    problemCount,
    platformIndexMap,
    activeUsernames,
  ) {
    const card = document.getElementById('platform-sync-card');
    const rows = document.getElementById('platform-sync-rows');
    if (!card || !rows) return;
    const platforms = Object.keys(activeUsernames || {}).filter(
      (p) => platformIndexMap[p] && platformIndexMap[p].size > 0,
    );
    rows.innerHTML = '';
    if (platforms.length === 0) {
      card.style.display = 'none';
      return;
    }
    platforms.forEach((platform) => {
      const uname = activeUsernames[platform];
      const set = platformIndexMap[platform] || /* @__PURE__ */ new Set();
      const row = document.createElement('div');
      row.className = 'platform-row';
      const left = document.createElement('div');
      left.className = 'platform-left';
      const badge = document.createElement('div');
      badge.className = 'platform-badge';
      badge.textContent = platform;
      const usernameSpan = document.createElement('div');
      usernameSpan.className = 'platform-username';
      usernameSpan.textContent = `@${uname}`;
      left.appendChild(badge);
      left.appendChild(usernameSpan);
      const segs = document.createElement('div');
      segs.className = 'segments';
      for (let i = 1; i <= problemCount; i++) {
        const seg = document.createElement('div');
        seg.className = 'segment' + (set.has(i) ? ' active' : '');
        segs.appendChild(seg);
      }
      row.appendChild(left);
      row.appendChild(segs);
      rows.appendChild(row);
    });
    card.style.display = 'block';
  }
  async function updatePlatformSyncPreview() {
    const card = document.getElementById('platform-sync-card');
    const autoTrackEl = document.getElementById('ojuz-autotrack');
    if (!card || !autoTrackEl) return;
    if (!autoTrackEl.checked || !lastRenderedContest || !lastRenderedOlympiad) {
      card.style.display = 'none';
      return;
    }
    const platformIndexMap = buildPlatformIndexMap(
      lastRenderedContest,
      lastRenderedOlympiad,
    );
    const activeUsernames = await fetchActiveUsernamesForSync(sessionToken);
    renderPlatformSyncCard(lastProblemCount, platformIndexMap, activeUsernames);
  }
  const autoTrackToggle = document.getElementById('ojuz-autotrack');
  autoTrackToggle?.addEventListener('change', () => {
    updatePlatformSyncPreview();
    const completionWarning = document.getElementById('completion-warning');
    let isCompleted = false;
    if (lastRenderedContest) {
      const key = `${lastRenderedContest.name}|${lastRenderedContest.stage || ''}`;
      isCompleted =
        completedContestKeys.has(key) ||
        completionWarning?.dataset?.reason === 'completed';
    }
    if (autoTrackToggle.checked) {
      if (lastRenderedContest && lastRenderedOlympiad && !isCompleted) {
        precheckCoverageAfterSelection(
          lastRenderedContest,
          lastRenderedOlympiad,
        );
      }
    } else {
      if (
        completionWarning &&
        completionWarning.dataset &&
        completionWarning.dataset.reason === 'coverage'
      ) {
        completionWarning.style.display = 'none';
        completionWarning.dataset.reason = '';
        startBtn.disabled = false;
      }
    }
  });
  olympiadSelect.addEventListener('change', (e) => {
    const selectedOlympiad = e.target.value;
    const divisionRow = document.getElementById('division-row');
    const contestRow = document.getElementById('contest-row');
    const dayRow = document.getElementById('day-row');
    const contestSelectLabel = document.getElementById('contest-select-label');
    divisionSelect.innerHTML = '<option value="">Select Division</option>';
    contestSelect.innerHTML = '<option value="">Select Contest</option>';
    daySelect.innerHTML = '<option value="">Select Day</option>';
    divisionSelect.disabled = true;
    contestSelect.disabled = true;
    daySelect.disabled = true;
    contestDetails.style.display = 'none';
    ojuzSection.style.display = 'none';
    startBtn.disabled = true;
    document.getElementById('platform-sync-card').style.display = 'none';
    const completionWarning = document.getElementById('completion-warning');
    completionWarning.style.display = 'none';
    if (selectedOlympiad === 'USACO_COMBINED') {
      divisionRow.style.display = 'block';
      contestRow.style.display = 'none';
      dayRow.style.display = 'none';
      contestSelectLabel.textContent = 'Year';
      const usacoDivisions = [
        'USACOBRONZE',
        'USACOSILVER',
        'USACOGOLD',
        'USACOPLATINUM',
      ];
      const availableDivisions = [];
      usacoDivisions.forEach((division) => {
        if (contestData[division]) {
          availableDivisions.push(division);
        }
      });
      availableDivisions.forEach((division) => {
        const option = document.createElement('option');
        option.value = division;
        const fullName = getFullOlympiadName(division);
        const displayName = fullName.startsWith('USACO ')
          ? fullName.substring(6)
          : fullName;
        option.textContent = displayName;
        divisionSelect.appendChild(option);
      });
      divisionSelect.disabled = false;
    } else {
      divisionRow.style.display = 'none';
      contestRow.style.display = selectedOlympiad ? 'block' : 'none';
      dayRow.style.display = 'none';
      contestSelectLabel.textContent = 'Contest';
      if (selectedOlympiad && contestData[selectedOlympiad]) {
        Object.keys(contestData[selectedOlympiad]).forEach((year) => {
          const contests = contestData[selectedOlympiad][year];
          const contestMap = {};
          contests.forEach((contest) => {
            if (!contestMap[contest.name]) {
              contestMap[contest.name] = contest;
            }
          });
          Object.values(contestMap).forEach((contest) => {
            const option = document.createElement('option');
            option.value = `${contest.name}|${year}`;
            option.textContent = contest.name;
            contestSelect.appendChild(option);
          });
        });
        contestSelect.disabled = false;
      }
    }
  });
  divisionSelect.addEventListener('change', (e) => {
    const selectedDivision = e.target.value;
    const contestRow = document.getElementById('contest-row');
    const dayRow = document.getElementById('day-row');
    contestSelect.innerHTML = '<option value="">Select Year</option>';
    daySelect.innerHTML = '<option value="">Select Day</option>';
    contestSelect.disabled = true;
    daySelect.disabled = true;
    contestDetails.style.display = 'none';
    ojuzSection.style.display = 'none';
    startBtn.disabled = true;
    document.getElementById('platform-sync-card').style.display = 'none';
    contestRow.style.display = selectedDivision ? 'block' : 'none';
    dayRow.style.display = 'none';
    if (selectedDivision && contestData[selectedDivision]) {
      Object.keys(contestData[selectedDivision]).forEach((year) => {
        const contests = contestData[selectedDivision][year];
        const contestMap = {};
        contests.forEach((contest) => {
          if (!contestMap[contest.name]) {
            contestMap[contest.name] = contest;
          }
        });
        Object.values(contestMap).forEach((contest) => {
          const option = document.createElement('option');
          option.value = `${contest.name}|${year}`;
          let displayName = contest.name;
          if (displayName.startsWith('USACO ')) {
            displayName = displayName.substring(6);
            const divisionName = getFullOlympiadName(selectedDivision).replace(
              'USACO ',
              '',
            );
            if (displayName.startsWith(divisionName + ' ')) {
              displayName = displayName.substring(divisionName.length + 1);
            }
          }
          option.textContent = displayName;
          contestSelect.appendChild(option);
        });
      });
      contestSelect.disabled = false;
    }
  });
  contestSelect.addEventListener('change', (e) => {
    const selectedContest = e.target.value;
    const selectedOlympiad = olympiadSelect.value;
    const selectedDivision = divisionSelect.value;
    const dayRow = document.getElementById('day-row');
    const dayLabel = dayRow.querySelector('label');
    daySelect.innerHTML = '<option value="">Select Stage</option>';
    daySelect.disabled = true;
    contestDetails.style.display = 'none';
    ojuzSection.style.display = 'none';
    startBtn.disabled = true;
    document.getElementById('platform-sync-card').style.display = 'none';
    const completionWarning = document.getElementById('completion-warning');
    completionWarning.style.display = 'none';
    dayRow.style.display = 'none';
    const dataSource =
      selectedOlympiad === 'USACO_COMBINED'
        ? selectedDivision
        : selectedOlympiad;
    if (selectedContest && contestData[dataSource]) {
      const [contestName, year] = selectedContest.split('|');
      const contests = contestData[dataSource][year] || [];
      const matchingContests = contests.filter((c) => c.name === contestName);
      const stages = [
        ...new Set(
          matchingContests.map((c) => c.stage).filter((stage) => stage != null),
        ),
      ].sort();
      if (
        matchingContests.length === 1 &&
        (matchingContests[0].stage == null || matchingContests[0].stage === '')
      ) {
        const contest = matchingContests[0];
        const contestKey = `${contestName}|${contest.stage || ''}`;
        const isCompleted =
          data.completed_contests &&
          data.completed_contests.includes(contestKey);
        const problemCount = contest.problems ? contest.problems.length : 3;
        let platforms = ['Unknown'];
        if (contest.problems && problemsData[dataSource]) {
          const platformSet = /* @__PURE__ */ new Set();
          contest.problems.forEach((prob) => {
            const yearProblems = problemsData[dataSource][prob.year] || [];
            const problem2 = yearProblems.find(
              (p) => p.id === prob.problemId,
            );
            if (problem2) {
              if (problem2.links && typeof problem2.links === 'object') {
                Object.keys(problem2.links).forEach((plat) =>
                  platformSet.add(plat),
                );
              } else {
                const url = problem2.link || chooseProblemUrl(problem2);
                if (url) platformSet.add(getPlatformFromLink(url));
              }
            }
          });
          platforms = Array.from(platformSet).filter(
            (p) => p && p !== 'Unknown',
          );
          if (platforms.length === 0) platforms = ['Unknown'];
        }
        document.getElementById('contest-duration').textContent =
          formatDuration(contest.duration_minutes);
        document.getElementById('contest-problems').textContent = problemCount;
        document.getElementById('contest-platform').textContent =
          platforms.join('/');
        contestDetails.style.display = 'block';
        lastRenderedContest = contest;
        lastRenderedOlympiad = dataSource;
        lastProblemCount = problemCount;
        updatePlatformSyncPreview();
        const completionWarning2 =
          document.getElementById('completion-warning');
        if (isCompleted) {
          completionWarning2.dataset.reason = 'completed';
          completionWarning2.style.display = 'block';
          startBtn.disabled = true;
        } else {
          completionWarning2.dataset.reason = '';
          completionWarning2.style.display = 'none';
          startBtn.disabled = false;
        }
        precheckCoverageAfterSelection(contest, dataSource);
        const hasAutoSynced =
          platforms && platforms.some((p) => auto_synced_platforms.includes(p));
        if (hasAutoSynced) {
          ojuzSection.style.display = 'block';
        } else {
          ojuzSection.style.display = 'none';
        }
        dayRow.style.display = 'none';
      } else if (stages.length > 0) {
        const allDayPattern = stages.every((stage) => /^Day \d+$/.test(stage));
        if (allDayPattern) {
          dayLabel.textContent = 'Day';
          daySelect.innerHTML = '<option value="">Select Day</option>';
        } else {
          dayLabel.textContent = 'Stage';
          daySelect.innerHTML = '<option value="">Select Stage</option>';
        }
        stages.forEach((stage) => {
          const option = document.createElement('option');
          option.value = stage;
          option.textContent = stage;
          daySelect.appendChild(option);
        });
        daySelect.disabled = false;
        dayRow.style.display = 'block';
      }
    }
  });
  daySelect.addEventListener('change', (e) => {
    document.getElementById('platform-sync-card').style.display = 'none';
    const selectedStage = e.target.value;
    const selectedOlympiad = olympiadSelect.value;
    const selectedDivision = divisionSelect.value;
    const selectedContest = contestSelect.value;
    const dataSource =
      selectedOlympiad === 'USACO_COMBINED'
        ? selectedDivision
        : selectedOlympiad;
    if (selectedStage && selectedContest && contestData[dataSource]) {
      const [contestName, year] = selectedContest.split('|');
      const contests = contestData[dataSource][year] || [];
      const contest = contests.find(
        (c) => c.name === contestName && c.stage === selectedStage,
      );
      if (!contest) return;
      const contestKey = `${contestName}|${selectedStage}`;
      const isCompleted =
        data.completed_contests && data.completed_contests.includes(contestKey);
      const problemCount = contest.problems ? contest.problems.length : 3;
      let platforms = ['Unknown'];
      if (contest.problems && problemsData[dataSource]) {
        const platformSet = /* @__PURE__ */ new Set();
        contest.problems.forEach((prob) => {
          const yearProblems = problemsData[dataSource][prob.year] || [];
          const problem2 = yearProblems.find(
            (p) => p.id === prob.problemId,
          );
          if (problem2) {
            if (problem2.links && typeof problem2.links === 'object') {
              Object.keys(problem2.links).forEach((plat) =>
                platformSet.add(plat),
              );
            } else {
              const url = problem2.link || chooseProblemUrl(problem2);
              if (url) platformSet.add(getPlatformFromLink(url));
            }
          }
        });
        platforms = Array.from(platformSet).filter((p) => p && p !== 'Unknown');
        if (platforms.length === 0) platforms = ['Unknown'];
      }
      document.getElementById('contest-duration').textContent = formatDuration(
        contest.duration_minutes,
      );
      document.getElementById('contest-problems').textContent = problemCount;
      document.getElementById('contest-platform').textContent =
        platforms.join('/');
      contestDetails.style.display = 'block';
      lastRenderedContest = contest;
      lastRenderedOlympiad = dataSource;
      lastProblemCount = problemCount;
      updatePlatformSyncPreview();
      const completionWarning = document.getElementById('completion-warning');
      if (isCompleted) {
        completionWarning.dataset.reason = 'completed';
        completionWarning.style.display = 'block';
        startBtn.disabled = true;
      } else {
        completionWarning.dataset.reason = '';
        completionWarning.style.display = 'none';
        startBtn.disabled = false;
      }
      precheckCoverageAfterSelection(contest, dataSource);
      const hasAutoSynced =
        platforms && platforms.some((p) => auto_synced_platforms.includes(p));
      if (hasAutoSynced) {
        ojuzSection.style.display = 'block';
      } else {
        ojuzSection.style.display = 'none';
      }
    }
  });
  startBtn.addEventListener('click', async () => {
    if (startBtn.disabled) {
      return;
    }
    const selectedOlympiad = olympiadSelect.value;
    const selectedDivision = divisionSelect.value;
    const selectedContest = contestSelect.value;
    const selectedStage = daySelect.value;
    const dataSource =
      selectedOlympiad === 'USACO_COMBINED'
        ? selectedDivision
        : selectedOlympiad;
    const [contestName, year] = selectedContest.split('|');
    const contests = contestData[dataSource][year] || [];
    let contest;
    let finalStage;
    if (daySelect.style.display === 'none' || !selectedStage) {
      const matchingContests = contests.filter((c) => c.name === contestName);
      if (matchingContests.length === 1) {
        contest = matchingContests[0];
        finalStage = contest.stage || null;
      } else {
        showMessage(
          'Error: Multiple contests found but no stage selected.',
          'error',
        );
        return;
      }
    } else {
      contest = contests.find(
        (c) => c.name === contestName && c.stage === selectedStage,
      );
      finalStage = selectedStage;
    }
    if (!contest) {
      showMessage('Error: Contest not found.', 'error');
      return;
    }
    const wantsAutoTrack =
      document.getElementById('ojuz-autotrack')?.checked || false;
    let platformUsernames = {};
    if (wantsAutoTrack) {
      try {
        const settingsRes = await fetch(`${apiUrl}/user/settings`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: sessionToken }),
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          platformUsernames =
            settings && settings.platformUsernames
              ? settings.platformUsernames
              : {};
        }
      } catch (e) {
        console.error(
          'Failed to fetch user settings for platform usernames',
          e,
        );
      }
      const hasAnyUsername = auto_synced_platforms.some(
        (p) => platformUsernames[p],
      );
      if (!hasAnyUsername) {
        showMessage(
          'To auto track submissions, set your username in Settings \u2192 Connections.',
          'warning',
        );
        return;
      }
      let missingCoverage = false;
      if (contest.problems && problemsData[dataSource]) {
        for (const prob of contest.problems) {
          const yearProblems = problemsData[dataSource][prob.year] || [];
          const problem2 = yearProblems.find(
            (p) => p.id === prob.problemId,
          );
          if (problem2) {
            let availablePlats = [];
            if (problem2.links && typeof problem2.links === 'object') {
              availablePlats = Object.keys(problem2.links);
            } else if (problem2.link) {
              availablePlats = [getPlatformFromLink(problem2.link)];
            }
            const ok = availablePlats.some(
              (plat) =>
                auto_synced_platforms.includes(plat) && platformUsernames[plat],
            );
            if (!ok) {
              missingCoverage = true;
              break;
            }
          }
        }
      }
    }
    try {
      const startResponse = await fetch(`${apiUrl}/user/virtual/start`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: sessionToken,
          name: contestName,
          stage: finalStage,
          autosynced: !!wantsAutoTrack,
        }),
      });
      if (!startResponse.ok) {
        const error = await startResponse.json();
        if (error.error === 'Contest already completed') {
          showMessage(
            'You have already completed this virtual contest.',
            'warning',
          );
        } else {
          showMessage('Failed to start contest: ' + error.error);
        }
        return;
      }
      localStorage.setItem('contest_ongoing', 'true');
      localStorage.removeItem('is_synced');
      localStorage.removeItem('ojuz_username');
    } catch (error) {
      showMessage('Failed to start contest: ' + error.message);
      return;
    }
    currentActiveContest = {
      contest_name: contestName,
      contest_stage: finalStage,
      start_time: /* @__PURE__ */ new Date().toISOString(),
      duration_minutes: contest.duration_minutes,
      location: contest.location || '',
      website: contest.website || '',
      link: contest.link || '',
      autosynced: !!wantsAutoTrack,
      problems: contest.problems || [],
      // Ensure problems are copied from the selected contest
    };
    vcForm.style.display = 'none';
    activeContest.style.display = 'block';
    const titleText = finalStage
      ? `${contestName} <svg width="12" height="3" viewBox="0 0 12 3" style="vertical-align: middle; margin: 0 4px;"><rect width="12" height="2" fill="currentColor"/></svg> ${finalStage}`
      : contestName;
    document.getElementById('active-contest-title').innerHTML = titleText;
    const locationElement = document.getElementById('active-contest-location');
    const websiteElement = document.getElementById('active-contest-website');
    if (contest.location || contest.website) {
      let metadataHTML = '';
      if (contest.location) {
        metadataHTML += contest.location;
      }
      if (contest.website) {
        if (metadataHTML) metadataHTML += ' | ';
        metadataHTML += `<a href="${contest.website}" target="_blank">${contest.website}</a>`;
      }
      locationElement.innerHTML = metadataHTML;
      locationElement.style.display = 'block';
      websiteElement.style.display = 'none';
    } else {
      locationElement.style.display = 'none';
      websiteElement.style.display = 'none';
    }
    startTimer(contest.duration_minutes);
  });
  document
    .getElementById('end-contest-btn')
    .addEventListener('click', async () => {
      const isAutosynced = asBool(currentActiveContest?.autosynced);
      try {
        if (isAutosynced) {
          activeContest.style.display = 'none';
          document.getElementById('ojuz-sync-loading').style.display = 'flex';
        }
        const response2 = await fetch(`${apiUrl}/user/virtual/end`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: sessionToken }),
        });
        if (isAutosynced) {
          document.getElementById('ojuz-sync-loading').style.display = 'none';
        }
        if (response2.ok) {
          const result = await response2.json();
          if (isAutosynced && result.submissions) {
            localStorage.setItem('contest_ongoing', 'false');
            localStorage.setItem('is_synced', 'true');
            localStorage.setItem(
              'ojuz_data',
              JSON.stringify(result.submissions),
            );
            const contestDurationMs =
              currentActiveContest.duration_minutes * 60 * 1e3;
            const startTime = new Date(currentActiveContest.start_time);
            const maxEndTime = new Date(
              startTime.getTime() + contestDurationMs,
            );
            const actualEndTime = /* @__PURE__ */ new Date();
            const cappedEndTime = new Date(
              Math.min(actualEndTime.getTime(), maxEndTime.getTime()),
            );
            currentActiveContest.end_time = cappedEndTime.toISOString();
            currentActiveContest.ojuz_data = result.submissions;
            showScoreEntry(true);
          } else {
            localStorage.setItem('contest_ongoing', 'false');
            localStorage.removeItem('is_synced');
            localStorage.removeItem('ojuz_username');
            const contestDurationMs =
              currentActiveContest.duration_minutes * 60 * 1e3;
            const startTime = new Date(currentActiveContest.start_time);
            const maxEndTime = new Date(
              startTime.getTime() + contestDurationMs,
            );
            const actualEndTime = /* @__PURE__ */ new Date();
            const cappedEndTime = new Date(
              Math.min(actualEndTime.getTime(), maxEndTime.getTime()),
            );
            currentActiveContest.end_time = cappedEndTime.toISOString();
            showScoreEntry(false);
          }
        } else {
          throw new Error('Failed to end contest');
        }
      } catch (error) {
        if (isAutosynced) {
          document.getElementById('ojuz-sync-loading').style.display = 'none';
          activeContest.style.display = 'block';
        }
        console.error('Error ending contest:', error);
        showMessage('Failed to end contest. Please try again.', 'error');
      }
    });
  document.getElementById('open-contest-btn').addEventListener('click', () => {
    const activeContestElement = document.getElementById('active-contest');
    if (activeContestElement.style.display !== 'none' && currentActiveContest) {
      if (currentActiveContest.link) {
        window.open(currentActiveContest.link, '_blank');
      } else {
        let links = [];
        for (let prob of currentActiveContest.problems) {
          for (let [stage, years] of Object.entries(problemsData)) {
            for (let [year2, data2] of Object.entries(years)) {
              let relevant = data2.find((i) => i.id == prob.problemId);
              if (relevant) {
                links.push({
                  name: relevant.name,
                  link: chooseProblemUrl(relevant),
                });
              }
            }
          }
        }
        showLinks(links);
      }
      return;
    }
    const selectedOlympiad = olympiadSelect.value;
    const selectedDivision = divisionSelect.value;
    const selectedContest = contestSelect.value;
    const dataSource =
      selectedOlympiad === 'USACO_COMBINED'
        ? selectedDivision
        : selectedOlympiad;
    if (!selectedOlympiad || !selectedContest || !contestData[dataSource]) {
      showMessage('No contest selected.', 'warning');
      return;
    }
    const [contestName, year] = selectedContest.split('|');
    const contests = contestData[dataSource][year] || [];
    let contest;
    let selectedStage;
    if (daySelect.style.display === 'none') {
      const matchingContests = contests.filter((c) => c.name === contestName);
      if (matchingContests.length === 1) {
        contest = matchingContests[0];
        selectedStage = contest.stage;
      }
    } else {
      selectedStage = daySelect.value;
      contest = contests.find(
        (c) => c.name === contestName && c.stage === selectedStage,
      );
    }
    if (contest && contest.link) {
      window.open(contest.link, '_blank');
    } else {
      showMessage('No contest link available for this contest.', 'warning');
    }
  });
  function getStatusColor(status) {
    switch (status) {
      case 2:
        return 'green';
      case 1:
        return 'yellow';
      case 0:
        return 'red';
      default:
        return 'white';
    }
  }
  function handleReadOnlyCellClick(cell, problem2, event) {
    event.preventDefault();
    const subtaskScores = JSON.parse(cell.dataset.subtaskScores || '[]');
    const totalScore = parseFloat(cell.dataset.score) || 0;
    showReadOnlyPopup(
      cell,
      {
        problemName: problem2.name,
        totalScore,
        subtaskScores,
      },
      event,
    );
  }
  function showReadOnlyPopup(cell, data2, event) {
    let readonlyPopup = document.getElementById('readonly-popup');
    if (!readonlyPopup) {
      const popupDiv = document.createElement('div');
      popupDiv.id = 'readonly-popup';
      popupDiv.className = 'readonly-popup hidden';
      popupDiv.innerHTML = `
        <div class="readonly-popup-content">
          <div class="readonly-popup-header">
            <div id="readonly-popup-problem"></div>
            <div id="readonly-popup-total-score"></div>
          </div>
          <div class="readonly-popup-subtasks" id="readonly-popup-subtasks"></div>
        </div>
      `;
      document.body.appendChild(popupDiv);
      popupDiv.addEventListener('click', (e) => {
        if (e.target === popupDiv) {
          hideReadOnlyPopup();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideReadOnlyPopup();
        }
      });
      readonlyPopup = popupDiv;
    }
    document.getElementById('readonly-popup-problem').textContent =
      data2.problemName;
    document.getElementById('readonly-popup-total-score').textContent =
      `Total Score: ${data2.totalScore}/100`;
    const subtasksDiv = document.getElementById('readonly-popup-subtasks');
    if (data2.subtaskScores && data2.subtaskScores.length > 0) {
      subtasksDiv.innerHTML =
        '<div class="subtasks-header">Subtask Scores:</div>';
      const subtasksList = document.createElement('div');
      subtasksList.className = 'subtasks-list';
      data2.subtaskScores.forEach((score, index) => {
        const subtaskDiv = document.createElement('div');
        subtaskDiv.className = 'subtask-item';
        subtaskDiv.innerHTML = `
          <span class="subtask-label">Subtask ${index + 1}:</span>
          <span class="subtask-score">${score}</span>
        `;
        subtasksList.appendChild(subtaskDiv);
      });
      subtasksDiv.appendChild(subtasksList);
    } else {
      subtasksDiv.innerHTML =
        '<div class="no-subtasks">No subtask information available</div>';
    }
    readonlyPopup.style.display = 'flex';
    readonlyPopup.classList.remove('hidden');
    setTimeout(() => {
      readonlyPopup.classList.add('show');
    }, 10);
  }
  function hideReadOnlyPopup() {
    const popup = document.getElementById('readonly-popup');
    if (popup) {
      popup.classList.remove('show');
      popup.classList.add('hidden');
      setTimeout(() => {
        popup.style.display = 'none';
      }, 300);
    }
  }
  document
    .getElementById('submit-scores-btn')
    .addEventListener('click', async () => {
      if (!currentActiveContest) {
        showMessage('No active contest data available.');
        return;
      }
      const isAutosynced = !!currentActiveContest.autosynced;
      if (isAutosynced) {
        try {
          const confirmResponse = await fetch(
            `${apiUrl}/user/virtual/confirm`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: sessionToken }),
            },
          );
          if (!confirmResponse.ok) {
            const error = await confirmResponse.json();
            showMessage('Failed to confirm virtual contest: ' + error.error);
            return;
          }
          window.location.href = '/virtual-history';
          localStorage.removeItem('is_synced');
          localStorage.removeItem('ojuz_data');
          localStorage.removeItem('ojuz_username');
        } catch (error) {
          showMessage('Failed to confirm contest: ' + error.message);
        }
        return;
      }
      let scores = [];
      let totalScore = 0;
      const problemCells = document.querySelectorAll(
        '#score-problems-tbody .problem-cell',
      );
      for (let i = 0; i < problemCells.length; i++) {
        const score = parseFloat(problemCells[i].dataset.score) || 0;
        if (score < 0 || score > 100) {
          showMessage(
            `${problemCells[i].dataset.problemId} score must be between 0 and 100.`,
            'warning',
          );
          return;
        }
        scores.push(score);
        totalScore += score;
      }
      try {
        for (let i = 0; i < problemCells.length; i++) {
          const cell = problemCells[i];
          const id = parseInt(cell.dataset.id);
          const problemName = cell.dataset.problemId;
          const score = parseFloat(cell.dataset.score) || 0;
          const status = parseInt(cell.dataset.status) || 0;
          const updateResponse = await fetch(`${apiUrl}/user/problems`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: sessionToken, id, status, score }),
          });
          if (!updateResponse.ok) {
            const error = await updateResponse.json();
            showMessage(
              `Failed to update score for ${problemName}: ${error.error}`,
            );
            return;
          }
        }
        const submitResponse = await fetch(`${apiUrl}/user/virtual/submit`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sessionToken, scores }),
        });
        if (!submitResponse.ok) {
          const error = await submitResponse.json();
          showMessage('Failed to submit virtual contest: ' + error.error);
          return;
        }
        window.location.href = '/virtual-history';
        localStorage.removeItem('is_synced');
        localStorage.removeItem('ojuz_data');
        localStorage.removeItem('ojuz_username');
      } catch (error) {
        showMessage('Failed to submit scores: ' + error.message);
      }
    });
  function startTimerWithSeconds(remainingSeconds, alreadyElapsedSeconds = 0) {
    const timerStartTime = Date.now();
    const initialTimeRemaining = remainingSeconds;
    const timer = document.getElementById('contest-timer');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    let intervalId = null;
    const updateDisplay = () => {
      const actualElapsedMs = Date.now() - timerStartTime;
      const actualElapsedSeconds = Math.floor(actualElapsedMs / 1e3);
      const timeRemaining = Math.max(
        0,
        initialTimeRemaining - actualElapsedSeconds,
      );
      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      const seconds = timeRemaining % 60;
      timer.textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      if (currentActiveContest && currentActiveContest.duration_minutes) {
        const totalElapsedSeconds =
          alreadyElapsedSeconds + actualElapsedSeconds;
        const totalContestSeconds = currentActiveContest.duration_minutes * 60;
        const cappedElapsedSeconds = Math.min(
          totalElapsedSeconds,
          totalContestSeconds,
        );
        const progressPercent =
          (cappedElapsedSeconds / totalContestSeconds) * 100;
        progressFill.style.width = `${Math.min(100, progressPercent)}%`;
        const elapsedHours = Math.floor(cappedElapsedSeconds / 3600);
        const elapsedMins = Math.floor((cappedElapsedSeconds % 3600) / 60);
        progressText.textContent = `${elapsedHours}h ${elapsedMins}m elapsed`;
      }
      if (timeRemaining <= 0) {
        if (intervalId) clearInterval(intervalId);
        timer.textContent = '0:00:00';
        progressFill.style.width = '100%';
        if (!document.hidden) {
          setTimeout(() => {
            showMessage(
              'Time is up! Please end your contest and submit your scores.',
              'warning',
            );
          }, 100);
        }
      }
    };
    updateDisplay();
    intervalId = setInterval(updateDisplay, 1e3);
  }
  function startTimer(remainingMinutes, alreadyElapsedMinutes = 0) {
    startTimerWithSeconds(remainingMinutes * 60, alreadyElapsedMinutes * 60);
  }
});
