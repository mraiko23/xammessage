const token = localStorage.getItem('token');
const userId = localStorage.getItem('userId');

if (!token) {
  window.location.href = '/';
}

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/contacts.html';
});

async function loadProfile() {
  try {
    const response = await fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const user = await response.json();
      document.getElementById('username').value = user.username;
      document.getElementById('description').value = user.description || '';

      const avatarDiv = document.getElementById('profileAvatar');
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

document.getElementById('changeAvatarBtn').addEventListener('click', () => {
  document.getElementById('avatarInput').click();
});

document.getElementById('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        const avatarDiv = document.getElementById('profileAvatar');
        avatarDiv.style.backgroundImage = `url(${result.avatarUrl})`;
        avatarDiv.textContent = '';
        alert('Avatar updated successfully!');
      } else {
        alert('Failed to upload avatar');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Error uploading avatar');
    }
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const description = document.getElementById('description').value;

  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ description })
    });

    if (response.ok) {
      alert('Profile updated successfully!');
    } else {
      alert('Failed to update profile');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Error updating profile');
  }
});

loadProfile();
