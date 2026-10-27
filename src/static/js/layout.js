const reorderList = document.getElementById('olympiad-reorder-list');
const hiddenList = document.getElementById('hidden-olympiad-list');
olympiadIds.forEach((id) => {
  const card = document.createElement('div');
  card.className = 'connection-card';
  card.dataset.id = id.toLowerCase();
  const h3 = document.createElement('h3');
  h3.className = 'connection-name';
  h3.textContent = getFullOlympiadName(id);
  card.appendChild(h3);
  reorderList.appendChild(card);
});
window.onload = async () => {
  const sessionToken = localStorage.getItem('sessionToken');
  check_session();
  const username = localStorage.getItem('username');
  document.getElementById('welcome-message').textContent =
    `Welcome, ${username}`;
  const user_settings = await fetch(`${apiUrl}/user/settings`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: sessionToken }),
  });
  if (user_settings.ok) {
    const data = await user_settings.json();
    if (data.olympiadOrder && Array.isArray(data.olympiadOrder)) {
      applyOlympiadOrder(data.olympiadOrder);
    }
    if (Array.isArray(data.hiddenOlympiads)) {
      applyHiddenOlympiads(data.hiddenOlympiads);
    }
    if (typeof data.ascSort === 'boolean') {
      localStorage.setItem('yearSortOrder', data.ascSort ? 'asc' : 'desc');
    }
  }
  document
    .querySelectorAll('#olympiad-reorder-list h3, #hidden-olympiad-list h3')
    .forEach((h3) => {
      h3.style.visibility = 'visible';
    });
  new Sortable(reorderList, {
    group: 'olympiads',
    animation: 150,
    ghostClass: 'dragging',
  });
  new Sortable(hiddenList, {
    group: 'olympiads',
    animation: 150,
    ghostClass: 'dragging',
  });
};
function applyOlympiadOrder(order) {
  const container = document.getElementById('olympiad-reorder-list');
  const cards = Array.from(container.children);
  const cardMap = new Map(cards.map((card) => [card.dataset.id, card]));
  container.innerHTML = '';
  const seen = /* @__PURE__ */ new Set();
  for (const id of order) {
    const card = cardMap.get(id.toLowerCase());
    if (card) {
      container.appendChild(card);
      seen.add(id.toLowerCase());
    }
  }
  for (const [id, card] of cardMap.entries()) {
    if (!seen.has(id.toLowerCase())) {
      container.appendChild(card);
    }
  }
}
function applyHiddenOlympiads(hidden) {
  const allCards = document.querySelectorAll('.connection-card');
  const hiddenList2 = document.getElementById('hidden-olympiad-list');
  hiddenList2.innerHTML = '';
  for (const id of hidden) {
    const card = Array.from(allCards).find(
      (card2) => card2.dataset.id === id.toLowerCase(),
    );
    if (card) {
      hiddenList2.appendChild(card);
    }
  }
}
function saveOlympiadOrder() {
  const order = Array.from(
    document.querySelectorAll('#olympiad-reorder-list .connection-card'),
  ).map((card) => card.dataset.id);
  const hidden = Array.from(
    document.querySelectorAll('#hidden-olympiad-list .connection-card'),
  ).map((card) => card.dataset.id);
  const sessionToken = localStorage.getItem('sessionToken');
  const messageBox = document.getElementById('popup-message-oly-save');
  messageBox.style.display = 'block';
  let currentTheme = localStorage.getItem('theme') || 'lightClassic';
  messageBox.color = currentTheme == 'lightClassic' ? 'black' : 'white';
  fetch(apiUrl + '/user/settings', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: sessionToken,
      updated: {
        olympiadOrder: order,
        hiddenOlympiads: hidden,
      },
    }),
  })
    .then((response) => response.json())
    .then((result2) => {
      if (result2.success) {
        messageBox.textContent = 'Olympiad order saved!';
        messageBox.style.color = 'green';
      } else {
        console.log(result2);
        messageBox.textContent = `Error saving order: ${result2.error || 'unknown error'}`;
        messageBox.style.color = 'red';
      }
    })
    .catch((err) => {
      console.error('Save failed:', err);
      messageBox.textContent = `Error saving order: ${result.error || 'unknown error'}`;
      messageBox.style.color = 'red';
    });
}
