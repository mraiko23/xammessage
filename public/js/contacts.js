const token = localStorage.getItem('token');
const currentUserId = localStorage.getItem('userId');

if (!token) {
  window.location.href = '/';
}

let currentView = 'chats';
let allUsers = [];
let allGroups = [];
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

// Load user profile
async function loadUserProfile() {
  try {
    const response = await fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const user = await response.json();
      document.getElementById('sidebarUsername').textContent = user.username;

      const avatarDiv = document.getElementById('sidebarAvatar');
      if (user.avatar) {
        avatarDiv.style.backgroundImage = `url(${user.avatar})`;
        avatarDiv.textContent = '';
      } else {
        avatarDiv.style.backgroundImage = 'none';
        avatarDiv.textContent = user.username.charAt(0).toUpperCase();
      }
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

// Load all users and groups
async function loadUsersAndGroups() {
  try {
    const [usersResponse, groupsResponse] = await Promise.all([
      fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }),
      fetch('/api/groups', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    ]);

    if (usersResponse.ok) {
      allUsers = await usersResponse.json();
    }

    if (groupsResponse.ok) {
      allGroups = await groupsResponse.json();
    }

    loadChats();
  } catch (error) {
    console.error('Error loading users and groups:', error);
  }
}

// Load chats with last messages
async function loadChats() {
  const chatsList = document.getElementById('chatsList');
  chatsList.innerHTML = '';

  try {
    const response = await fetch('/api/messages', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const messages = await response.json();

      // Group messages by conversation
      const conversations = {};

      messages.forEach(message => {
        const otherUserId = message.fromUserId === currentUserId ? message.toUserId : message.fromUserId;
        if (!conversations[otherUserId]) {
          conversations[otherUserId] = {
            userId: otherUserId,
            lastMessage: message,
            timestamp: new Date(message.timestamp)
          };
        } else if (new Date(message.timestamp) > conversations[otherUserId].timestamp) {
          conversations[otherUserId].lastMessage = message;
          conversations[otherUserId].timestamp = new Date(message.timestamp);
        }
      });

      // Always add "Избранное" (Favorites) chat first
      const currentUser = allUsers.find(u => u.id === currentUserId);
      if (currentUser) {
        const selfMessages = messages.filter(m => m.fromUserId === currentUserId && m.toUserId === currentUserId);
        const lastSelfMessage = selfMessages.length > 0 ? selfMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] : null;
        const favoritesChatDiv = createChatItem(currentUser, lastSelfMessage, false, true);
        chatsList.appendChild(favoritesChatDiv);
      }

      // Sort conversations by last message timestamp
      const sortedConversations = Object.values(conversations).sort((a, b) => b.timestamp - a.timestamp);

      sortedConversations.forEach(conv => {
        const user = allUsers.find(u => u.id === conv.userId);
        if (user && user.id !== currentUserId) { // Exclude self-chat from regular chats
          const chatDiv = createChatItem(user, conv.lastMessage);
          chatsList.appendChild(chatDiv);
        }
      });

      // Add groups to the chats list
      allGroups.forEach(group => {
        if (group.members.includes(currentUserId)) {
          const groupDiv = createGroupItem(group);
          chatsList.appendChild(groupDiv);
        }
      });

      // If no other chats, show all users as potential chats (excluding self)
      if (sortedConversations.length === 0) {
        allUsers.forEach(user => {
          if (user.id !== currentUserId) {
            const chatDiv = createChatItem(user, null);
            chatsList.appendChild(chatDiv);
          }
        });
      }
    }
  } catch (error) {
    console.error('Error loading chats:', error);
  }
}

// Load favorites
function loadFavorites() {
  const chatsList = document.getElementById('chatsList');
  chatsList.innerHTML = '';

  favorites.forEach(favId => {
    const user = allUsers.find(u => u.id === favId);
    if (user) {
      const favDiv = createChatItem(user, null, true);
      chatsList.appendChild(favDiv);
    }
  });

  if (favorites.length === 0) {
    chatsList.innerHTML = '<div class="no-favorites">No favorites yet. Add users to favorites from chat!</div>';
  }
}

// Create chat item
function createChatItem(user, lastMessage, isFavorite = false, isSelfChat = false) {
  const chatDiv = document.createElement('div');
  chatDiv.className = 'chat-item';

  const avatarHtml = user.avatar
    ? `<div class="chat-avatar" style="background-image: url(${user.avatar})"></div>`
    : `<div class="chat-avatar">${isSelfChat ? '⭐' : user.username.charAt(0).toUpperCase()}</div>`;

  const chatName = isSelfChat ? 'Избранное' : user.username;
  const lastMessageText = lastMessage ? (lastMessage.content || 'Attachment') : 'No messages yet';
  const timeText = lastMessage ? formatTime(new Date(lastMessage.timestamp)) : '';

  chatDiv.innerHTML = `
    ${avatarHtml}
    <div class="chat-info">
      <div class="chat-name">${chatName}</div>
      <div class="chat-last-message">${lastMessageText}</div>
    </div>
    <div class="chat-time">${timeText}</div>
    ${isFavorite ? '<div class="favorite-indicator">⭐</div>' : ''}
  `;

  chatDiv.addEventListener('click', () => {
    localStorage.setItem('selectedUser', JSON.stringify(user));
    localStorage.removeItem('selectedGroup'); // Clear any previous group selection
    window.location.href = '/chat.html';
  });

  return chatDiv;
}

// Create group item
function createGroupItem(group) {
  const groupDiv = document.createElement('div');
  groupDiv.className = 'chat-item group-item';

  const avatarHtml = group.avatar
    ? `<div class="chat-avatar" style="background-image: url(${group.avatar})"></div>`
    : `<div class="chat-avatar">👥</div>`;

  const memberCount = group.members.length;
  const lastMessageText = `Group • ${memberCount} member${memberCount !== 1 ? 's' : ''}`;

  groupDiv.innerHTML = `
    ${avatarHtml}
    <div class="chat-info">
      <div class="chat-name">${group.name}</div>
      <div class="chat-last-message">${lastMessageText}</div>
    </div>
    <div class="chat-time"></div>
  `;

  groupDiv.addEventListener('click', () => {
    localStorage.setItem('selectedGroup', JSON.stringify(group));
    window.location.href = '/chat.html';
  });

  return groupDiv;
}

// Format time
function formatTime(date) {
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString();
}

// Event listeners
document.getElementById('createGroupBtn').addEventListener('click', () => {
  document.getElementById('createGroupModal').style.display = 'flex';
});

document.getElementById('closeCreateGroupModalBtn').addEventListener('click', () => {
  document.getElementById('createGroupModal').style.display = 'none';
});

document.getElementById('createGroupConfirmBtn').addEventListener('click', async () => {
  const groupName = document.getElementById('groupNameInput').value.trim();
  const groupDescription = document.getElementById('groupDescriptionInput').value.trim();

  if (!groupName) {
    alert('Group name is required');
    return;
  }

  try {
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: groupName, description: groupDescription })
    });

    if (response.ok) {
      const newGroup = await response.json();

      // Get invite link for the newly created group
      const inviteResponse = await fetch(`/api/groups/${newGroup.id}/invite`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (inviteResponse.ok) {
        const inviteData = await inviteResponse.json();
        // Show the invite link to the user
        const inviteLink = inviteData.inviteLink;
        prompt('Group created successfully! Share this invite link:', inviteLink);
      }

      document.getElementById('createGroupModal').style.display = 'none';
      document.getElementById('groupNameInput').value = '';
      document.getElementById('groupDescriptionInput').value = '';
      loadUsersAndGroups(); // Refresh the groups list
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to create group');
    }
  } catch (error) {
    console.error('Error creating group:', error);
    alert('Error creating group');
  }
});

document.getElementById('profileBtn').addEventListener('click', () => {
  window.location.href = '/profile.html';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/';
});

document.getElementById('chatsTab').addEventListener('click', () => {
  currentView = 'chats';
  document.getElementById('chatsTab').classList.add('active');
  document.getElementById('favoritesTab').classList.remove('active');
  loadChats();
});

document.getElementById('favoritesTab').addEventListener('click', () => {
  currentView = 'favorites';
  document.getElementById('favoritesTab').classList.add('active');
  document.getElementById('chatsTab').classList.remove('active');
  loadFavorites();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const chatItems = document.querySelectorAll('.chat-item');

  chatItems.forEach(item => {
    const name = item.querySelector('.chat-name').textContent.toLowerCase();
    const isSelfChat = name === 'избранное';
    if (isSelfChat) {
      item.style.display = 'flex'; // Always show favorites chat
    } else {
      item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
    }
  });
});

// Initialize
loadUserProfile();
loadUsersAndGroups();
