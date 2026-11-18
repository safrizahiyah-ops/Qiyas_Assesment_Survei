import type { Timestamp } from 'firebase/firestore';

export type QuestionType =
  | 'scale'
  | 'scale10'
  | 'wordcloud'
  | 'choice'
  | 'multichoice'
  | 'yesno'
  | 'text';

export type TemplateType =
  | 'persepsi_awal'
  | 'ekspektasi'
  | 'evaluasi_akhir'
  | 'kosong';

export type SessionStatus = 'aktif' | 'ditutup' | 'menunggu' | 'selesai';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  labels: string[];
  options: string[];
  scaleMin?: string;
  scaleMax?: string;
}

export interface Survey {
  id: string;
  ownerUid: string;
  title: string;
  eventInfo?: string;
  templateType: TemplateType;
  questions: Question[];
  allowAnonymous: boolean;
  activeSessionCode?: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface LiveSession {
  code: string;
  surveyId: string;
  ownerUid: string;
  surveyTitle: string;
  eventInfo?: string;
  allowAnonymous: boolean;
  questions: Question[];
  status: SessionStatus;
  activeQuestionId: string;
  showResults?: boolean;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

export interface Participant {
  id: string;
  name: string;
  isDemo?: boolean;
  joinedAt?: Timestamp | Date | null;
}

export interface SurveyResponse {
  id: string;
  pid: string;
  name: string;
  questionId: string;
  value: number | string | string[];
  isDemo?: boolean;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}
