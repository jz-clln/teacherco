// src/types/domain.ts

export type UUID = string;
export type ClassStatus = "active" | "archived";
export type EnrollmentStatus = "active" | "inactive";
export type AssessmentKind = "multiple_choice" | "true_false" | "short_answer" | "essay" | "mixed";
export type AssessmentStatus = "draft" | "active" | "closed";

export interface TeacherClass {
  id: UUID;
  section_id?: UUID | null;
  teacher_id: UUID;
  name: string;
  subject: string;
  grade_level: string;
  school_year: string;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: UUID;
  teacher_id: UUID;
  name: string;
  grade_level: string;
  school_year: string;
  school_name: string | null;
  school_id: string | null;
  is_adviser: boolean;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
}

export interface SectionEnrollment {
  id: UUID;
  teacher_id: UUID;
  section_id: UUID;
  learner_id: UUID;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
}

export interface Learner {
  id: UUID;
  teacher_id: UUID;
  first_name?: string | null;
  last_name?: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}
