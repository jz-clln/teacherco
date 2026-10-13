import {z} from 'zod';
const id=z.string().uuid(), text=(max:number)=>z.string().trim().min(1).max(max);
const own={id,teacher_id:id}, member={id,learner_id:id,status:z.enum(['active','inactive'])};
export const recordSchemas:Record<string,z.ZodType>={
  classes:z.object({...own,name:text(120),subject:text(120),grade_level:text(50),school_year:text(30),status:z.enum(['active','archived'])}).strict(),
  learners:z.object({...own,first_name:text(120),last_name:text(120),display_name:text(241)}).strict(),
  class_enrollments:z.object({...member,class_id:id}).strict(),
  assessments:z.object({id,class_id:id,title:text(160),activity_slot:text(160).nullable(),term:z.number().int().min(1).max(3).nullable(),component:z.enum(['written_work','performance_task','assessment']).nullable(),total_points:z.number().positive().max(10000),source:z.enum(['manual','imported','checked']),status:z.enum(['draft','active','closed'])}).strict(),
  submissions:z.object({id,assessment_id:id,learner_id:id,score:z.number().min(0).max(10000).nullable(),max_score:z.number().min(0).max(10000).nullable(),review_status:z.literal('confirmed')}).strict().refine(r=>r.score===null || (r.max_score!==null && r.score<=r.max_score),'Score exceeds the maximum.'),
  sections:z.object({...own,name:text(120),grade_level:text(50),school_year:text(30),status:z.enum(['active','archived'])}).strict(),
  section_enrollments:z.object({...own,...member,section_id:id}).strict(),
  section_subjects:z.object({...own,section_id:id,name:text(120),position:z.number().int().positive(),status:z.enum(['active','inactive'])}).strict(),
  section_grade_periods:z.object({...own,section_id:id,key:z.string().regex(/^period_[a-zA-Z0-9_-]+$/).max(80),label:text(60),position:z.number().int().min(1).max(8),status:z.enum(['active','inactive'])}).strict(),
  section_grade_entries:z.object({...own,section_id:id,learner_id:id,section_subject_id:id,period_id:id,grade:z.number().min(0).max(100).nullable(),source_type:z.literal('manual')}).strict(),
};
export const operationSchema=z.object({owner:id,id,table:z.string(),row:z.record(z.string(),z.unknown()),before:z.record(z.string(),z.unknown()).nullable()});
