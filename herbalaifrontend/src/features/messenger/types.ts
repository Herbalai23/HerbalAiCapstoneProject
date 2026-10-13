export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

export interface ChatMessage {
  id: number;
  senderId: string;
  receiverId: string;
  content: string;
  imageUrl?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  time: string;
  sender: UserProfile;
  receiver?: UserProfile;
}

export interface Conversation {
  contact: UserProfile;
  lastMessage: string;
  lastTime: string;
}
