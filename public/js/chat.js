const token = localStorage.getItem('token');
const userId = localStorage.getItem('userId');
const selectedUser = JSON.parse(localStorage.getItem('selectedUser'));
const selectedGroup = JSON.parse(localStorage.getItem('selectedGroup'));

if (!token || !userId) {
  window.location.href = '/';
}

if (!selectedUser && !selectedGroup) {
  window.location.href = '/contacts.html';
}

// Initialize elements
const socket = io({
  auth: {
    token: token
  }
});

const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const voiceBtn = document.getElementById('voiceBtn');
const fileInput = document.getElementById('fileInput');
const backBtn = document.getElementById('backBtn');
const favoriteBtn = document.getElementById('favoriteBtn');
const voiceCallBtn = document.getElementById('voiceCallBtn');
const videoCallBtn = document.getElementById('videoCallBtn');

// Attachment preview elements
const attachmentPreview = document.getElementById('attachmentPreview');
const previewMedia = document.getElementById('previewMedia');
const attachmentCaption = document.getElementById('attachmentCaption');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const sendAttachmentBtn = document.getElementById('sendAttachmentBtn');

// Voice recording variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingInterval = null;

let recipientId = null;
let isGroupChat = false;

if (selectedGroup) {
  // Group chat
  recipientId = selectedGroup.id;
  isGroupChat = true;
  document.getElementById('chatUserName').textContent = selectedGroup.name;
  const avatarDiv = document.getElementById('chatUserAvatar');
  if (selectedGroup.avatar) {
    avatarDiv.style.backgroundImage = `url(${selectedGroup.avatar})`;
    avatarDiv.textContent = '';
  } else {
    avatarDiv.style.backgroundImage = 'none';
    avatarDiv.textContent = '👥';
  }
  favoriteBtn.style.display = 'none';
  voiceCallBtn.style.display = 'block';
  videoCallBtn.style.display = 'block';
} else if (selectedUser.id === userId) {
  // Handle self-chat (Favorites)
  recipientId = selectedUser.id;
  document.getElementById('chatUserName').textContent = 'Избранное';
  const avatarDiv = document.getElementById('chatUserAvatar');
  avatarDiv.style.backgroundImage = 'none';
  avatarDiv.textContent = '⭐';
  favoriteBtn.style.display = 'none';
  voiceCallBtn.style.display = 'none';
  videoCallBtn.style.display = 'none';
} else {
  // Regular chat
  recipientId = selectedUser.id;
  document.getElementById('chatUserName').textContent = selectedUser.username;
  const avatarDiv = document.getElementById('chatUserAvatar');
  if (selectedUser.avatar) {
    avatarDiv.style.backgroundImage = `url(${selectedUser.avatar})`;
    avatarDiv.textContent = '';
  } else {
    avatarDiv.style.backgroundImage = 'none';
    avatarDiv.textContent = selectedUser.username.charAt(0).toUpperCase();
  }
  favoriteBtn.style.display = 'block';
  voiceCallBtn.style.display = 'block';
  videoCallBtn.style.display = 'block';
}

// Check if user is in favorites
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
updateFavoriteButton();

function updateFavoriteButton() {
  const isFavorite = favorites.includes(selectedUser.id);
  favoriteBtn.textContent = isFavorite ? '⭐' : '☆';
  favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
}

function addMessage(message, isSent) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  messageDiv.dataset.messageId = message.id;

  let content = `<div class="message-content">${message.content}</div>`;

  // Check if it's a call message
  const callLinkMatch = message.content.match(/(https?:\/\/[^\s]+call\.html\?callId=[^\s]+)/);
  if (callLinkMatch) {
    const callLink = callLinkMatch[1];
    const isCallMessage = message.content.includes('Incoming') && message.content.includes('call');
    if (isCallMessage) {
      content = `<div class="call-message">
        <div class="call-content">${message.content.replace(callLink, '')}</div>
        <button class="join-call-btn" onclick="joinCall('${callLink}')">Присоединиться к звонку</button>
      </div>`;
    }
  }

  if (message.attachment) {
    if (message.attachment.type === 'image') {
      content += `<img src="${message.attachment.url}" alt="${message.attachment.originalName}" class="message-image" onclick="openMediaModal('${message.attachment.url}', 'image')" />`;
    } else if (message.attachment.type === 'video') {
      content += `<video controls class="message-video" onclick="openMediaModal('${message.attachment.url}', 'video')"><source src="${message.attachment.url}" type="video/mp4"></video>`;
    } else if (message.attachment.type === 'audio') {
      content += `<div class="message-audio"><audio controls><source src="${message.attachment.url}" type="audio/mpeg"></audio></div>`;
    } else {
      const truncatedName = message.attachment.originalName.length > 20
        ? message.attachment.originalName.substring(0, 17) + '...'
        : message.attachment.originalName;
      content += `<a href="${message.attachment.url}" download="${message.attachment.originalName}" class="message-file" title="${message.attachment.originalName}">📎 ${truncatedName}</a>`;
    }
  }

  content += `<div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>`;

  // Add action buttons for owner messages
  if (isSent) {
    content += `
      <div class="message-actions">
        <button class="action-btn reply-btn" title="Reply">↩️</button>
        <button class="action-btn copy-btn" title="Copy">📋</button>
        <button class="action-btn edit-btn" title="Edit">✏️</button>
        <button class="action-btn delete-btn" title="Delete">🗑️</button>
      </div>
    `;
  }

  messageDiv.innerHTML = content;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Add event listeners for actions
  if (isSent) {
    const replyBtn = messageDiv.querySelector('.reply-btn');
    const copyBtn = messageDiv.querySelector('.copy-btn');
    const editBtn = messageDiv.querySelector('.edit-btn');
    const deleteBtn = messageDiv.querySelector('.delete-btn');

    replyBtn.addEventListener('click', () => replyToMessage(message));
    copyBtn.addEventListener('click', () => copyMessage(message));
    editBtn.addEventListener('click', () => editMessage(message));
    deleteBtn.addEventListener('click', () => deleteMessage(message));
  }
}

socket.on('loadMessages', (messages) => {
  // Filter messages based on chat type
  if (isGroupChat) {
    // Group chat: show messages for the group
    messages = messages.filter(msg => msg.toGroupId === recipientId);
  } else if (selectedUser.id === userId) {
    // Favorites: only show self-messages
    messages = messages.filter(msg => msg.fromUserId === userId && msg.toUserId === userId);
  } else {
    // Regular chat: show messages between current user and selected user
    messages = messages.filter(msg =>
      (msg.fromUserId === userId && msg.toUserId === selectedUser.id) ||
      (msg.fromUserId === selectedUser.id && msg.toUserId === userId)
    );
  }

  messages.forEach(message => {
    const isSent = message.fromUserId === userId;
    addMessage(message, isSent);
  });
});
socket.on('message', (message) => {
  const isSent = message.fromUserId === userId;
  addMessage(message, isSent);
});

socket.on('messageEdited', (message) => {
  const messageDiv = document.querySelector(`[data-message-id="${message.id}"]`);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.textContent = message.content;
      contentDiv.style.fontStyle = 'italic';
    }
  }
});

socket.on('messageDeleted', (data) => {
  const messageDiv = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageDiv) {
    messageDiv.remove();
  }
});

sendBtn.addEventListener('click', () => {
  const content = messageInput.value.trim();
  if (content) {
    const messageData = isGroupChat ? { toGroupId: recipientId, content } : { toUserId: recipientId, content };
    socket.emit('sendMessage', messageData);
    messageInput.value = '';
  }
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendBtn.click();
  }
});

// Handle file attachment
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

// Back button
backBtn.addEventListener('click', () => {
  window.location.href = '/contacts.html';
});

// Message action functions
function replyToMessage(message) {
  messageInput.value = `↩️ ${message.content}`;
  messageInput.focus();
}

function copyMessage(message) {
  // Get the current content from the DOM to ensure we copy the latest edited version
  const messageDiv = document.querySelector(`[data-message-id="${message.id}"]`);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (contentDiv) {
      navigator.clipboard.writeText(contentDiv.textContent).then(() => {
        alert('Message copied to clipboard');
      });
    }
  }
}

function editMessage(message) {
  const newContent = prompt('Edit message:', message.content);
  if (newContent && newContent.trim() !== message.content) {
    socket.emit('editMessage', { messageId: message.id, content: newContent.trim() });
  }
}

function deleteMessage(message) {
  if (confirm('Delete this message?')) {
    socket.emit('deleteMessage', { messageId: message.id });
  }
}

// Favorite button
favoriteBtn.addEventListener('click', () => {
  const isFavorite = favorites.includes(selectedUser.id);
  if (isFavorite) {
    favorites = favorites.filter(id => id !== selectedUser.id);
  } else {
    favorites.push(selectedUser.id);
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavoriteButton();
});

// Call buttons
voiceCallBtn.addEventListener('click', () => {
  startCall('voice');
});

videoCallBtn.addEventListener('click', () => {
  startCall('video');
});

function startCall(type) {
  const callId = generateCallId();
  localStorage.setItem('currentCall', JSON.stringify({
    callId,
    type,
    withUser: selectedUser,
    initiator: true
  }));

  // Send call message to chat
  const callLink = `${window.location.origin}/call.html?callId=${callId}&type=${type}`;
  const callMessage = `${type === 'voice' ? '📞' : '📹'} Incoming ${type} call. Tap to join: ${callLink}`;
  const messageData = isGroupChat ? { toGroupId: recipientId, content: callMessage } : { toUserId: recipientId, content: callMessage };
  socket.emit('sendMessage', messageData);

  // Open call window for initiator
  window.open(callLink, '_blank', 'width=800,height=600');
}

function generateCallId() {
  return 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function joinCall(callLink) {
  // Extract callId and type from link
  const url = new URL(callLink);
  const callId = url.searchParams.get('callId');
  const type = url.searchParams.get('type');

  localStorage.setItem('currentCall', JSON.stringify({
    callId,
    type,
    withUser: selectedUser,
    initiator: false
  }));

  window.open(callLink, '_blank', 'width=800,height=600');
}

// Voice recording functionality
voiceBtn.addEventListener('click', async () => {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
        await sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();

      // Update UI to show recording state
      updateVoiceRecordingUI();

      // Start timer
      recordingInterval = setInterval(updateVoiceRecordingUI, 1000);

    } catch (error) {
      console.error('Error starting voice recording:', error);
      alert('Could not access microphone');
    }
  } else {
    stopVoiceRecording();
  }
});

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingInterval);
    updateVoiceRecordingUI();
  }
}

function updateVoiceRecordingUI() {
  if (isRecording) {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Replace input area with recording UI
    const inputContainer = document.querySelector('.chat-input');
    inputContainer.innerHTML = `
      <div class="voice-recording">
        <div class="recording-indicator"></div>
        <span class="recording-time">${timeString}</span>
        <button class="stop-btn" onclick="stopVoiceRecording()">⏹️</button>
      </div>
    `;
  } else {
    // Restore normal input UI
    const inputContainer = document.querySelector('.chat-input');
    inputContainer.innerHTML = `
      <input type="file" id="fileInput" accept="image/*,video/*,.pdf,.doc,.docx,.txt,audio/*" style="display: none;" />
      <button id="attachBtn" title="Attach file">📎</button>
      <button id="voiceBtn" title="Record voice message">🎤</button>
      <input type="text" id="messageInput" placeholder="Type a message..." />
      <button id="sendBtn">Send</button>
    `;

    // Re-attach event listeners
    document.getElementById('attachBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('voiceBtn').addEventListener('click', async () => {
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
            await sendVoiceMessage(audioBlob);
            stream.getTracks().forEach(track => track.stop());
          };

          mediaRecorder.start();
          isRecording = true;
          recordingStartTime = Date.now();
          updateVoiceRecordingUI();
          recordingInterval = setInterval(updateVoiceRecordingUI, 1000);
        } catch (error) {
          console.error('Error starting voice recording:', error);
          alert('Could not access microphone');
        }
      } else {
        stopVoiceRecording();
      }
    });
    document.getElementById('sendBtn').addEventListener('click', () => {
      const content = document.getElementById('messageInput').value.trim();
      if (content) {
        const messageData = isGroupChat ? { toGroupId: recipientId, content } : { toUserId: recipientId, content };
        socket.emit('sendMessage', messageData);
        document.getElementById('messageInput').value = '';
      }
    });
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('sendBtn').click();
      }
    });
  }
}

async function sendVoiceMessage(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'voice_message.mp3');

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const uploadData = await response.json();
      const attachment = {
        type: 'audio',
        filename: uploadData.filename,
        originalName: 'Voice message',
        url: uploadData.url
      };

      const messageData = isGroupChat ? { toGroupId: recipientId, content: '', attachment } : { toUserId: recipientId, content: '', attachment };
      socket.emit('sendMessage', messageData);
    } else {
      alert('Failed to upload voice message');
    }
  } catch (error) {
    console.error('Voice upload error:', error);
    alert('Failed to upload voice message');
  }
}

// Attachment preview functionality
function showAttachmentPreview(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    previewMedia.innerHTML = '';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '400px';
      img.style.objectFit = 'contain';
      previewMedia.appendChild(img);
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = e.target.result;
      video.controls = true;
      video.style.maxWidth = '100%';
      video.style.maxHeight = '400px';
      video.style.objectFit = 'contain';
      previewMedia.appendChild(video);
    } else {
      // For other file types, show file info
      const fileInfo = document.createElement('div');
      fileInfo.style.cssText = `
        padding: 20px;
        text-align: center;
        background: #f5f5f5;
        border-radius: 8px;
        font-size: 16px;
      `;
      fileInfo.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 10px;">📎</div>
        <div style="font-weight: bold;">${file.name}</div>
        <div style="color: #666; margin-top: 5px;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
      `;
      previewMedia.appendChild(fileInfo);
    }

    attachmentCaption.value = '';
    attachmentPreview.style.display = 'flex';
  };

  reader.readAsDataURL(file);
}

closePreviewBtn.addEventListener('click', () => {
  attachmentPreview.style.display = 'none';
});

sendAttachmentBtn.addEventListener('click', () => {
  const caption = attachmentCaption.value.trim();
  const file = fileInput.files[0];

  if (file) {
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/upload', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(uploadData => {
      const attachment = {
        type: uploadData.type,
        filename: uploadData.filename,
        originalName: uploadData.originalName,
        url: uploadData.url
      };

      const messageData = isGroupChat ? { toGroupId: recipientId, content: caption, attachment } : { toUserId: recipientId, content: caption, attachment };
      socket.emit('sendMessage', messageData);

      attachmentPreview.style.display = 'none';
      attachmentCaption.value = '';
      fileInput.value = '';
    })
    .catch(error => {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    });
  }
});

// Media modal for viewing images/videos
function openMediaModal(url, type) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    cursor: pointer;
  `;

  const mediaElement = document.createElement(type === 'image' ? 'img' : 'video');
  mediaElement.src = url;
  mediaElement.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
  `;

  if (type === 'video') {
    mediaElement.controls = true;
  }

  const downloadBtn = document.createElement('a');
  downloadBtn.href = url;
  downloadBtn.download = '';
  downloadBtn.textContent = '⬇️ Download';
  downloadBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    text-decoration: none;
    font-size: 14px;
  `;

  modal.appendChild(mediaElement);
  modal.appendChild(downloadBtn);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  document.body.appendChild(modal);
}

// Update file input to show preview for all files
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    showAttachmentPreview(file);
  }
});
