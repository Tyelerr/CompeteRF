import { MessageType } from './common.types';

export interface Message {
  id: number;
  sender_id: number;
  sender_role: string;
  tournament_id?: number;
  template_id?: number;
  venue_id?: number;
  subject: string;
  body: string;
  body_es?: string;
  message_type: MessageType;
  target_type?: string;
  target_filter?: object;
  recipient_count?: number;
  created_at: string;
}

export interface MessageRecipient {
  id: number;
  message_id: number;
  user_id: number;
  read_at?: string;
  created_at: string;
}

export interface SavedSearch {
  id: number;
  user_id: number;
  name: string;
  filters: object;
  alert_enabled: boolean;
  alert_frequency?: 'immediately' | 'daily' | 'weekly';
  created_at: string;
  updated_at: string;
  last_applied_at?: string;
}

export interface SupportTicket {
  id: number;
  user_id: number;
  subject: string;
  description: string;
  category?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: number;
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  data?: object;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  error_message?: string;
  scheduled_for: string;
  created_at: string;
}
```

---

# 🎉 All TypeScript Types Complete!

You now have:
```
src/models/types/
├── index.ts
├── common.types.ts
├── profile.types.ts
├── venue.types.ts
├── tournament.types.ts
├── giveaway.types.ts
└── message.types.ts