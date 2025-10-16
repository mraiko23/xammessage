class Message {
  constructor(fromUserId, toUserId, content, attachment = null, toGroupId = null) {
    this.id = Date.now().toString();
    this.fromUserId = fromUserId;
    this.toUserId = toUserId;
    this.toGroupId = toGroupId;
    this.content = content;
    this.attachment = attachment; // { type: 'image'|'video'|'file', filename: string, originalName: string }
    this.timestamp = new Date();
    this.callEnded = false;
  }
}

module.exports = Message;
