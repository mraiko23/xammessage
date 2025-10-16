class User {
  constructor(username, passwordHash) {
    this.id = Date.now().toString();
    this.username = username;
    this.passwordHash = passwordHash;
    this.description = '';
    this.avatar = null; // URL to avatar image
    this.createdAt = new Date();
  }
}

module.exports = User;
