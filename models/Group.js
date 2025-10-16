class Group {
  constructor(id, name, description, creatorId, members = [], avatar = null, createdAt = new Date()) {
    this.id = id;
    this.name = name;
    this.description = description || '';
    this.creatorId = creatorId;
    this.members = members; // Array of user IDs
    this.avatar = avatar;
    this.createdAt = createdAt;
  }

  addMember(userId) {
    if (!this.members.includes(userId)) {
      this.members.push(userId);
    }
  }

  removeMember(userId) {
    this.members = this.members.filter(id => id !== userId);
  }

  hasMember(userId) {
    return this.members.includes(userId);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      creatorId: this.creatorId,
      members: this.members,
      avatar: this.avatar,
      createdAt: this.createdAt
    };
  }
}

module.exports = Group;
