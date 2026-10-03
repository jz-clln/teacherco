export type LegalSection = { id: string; title: string; paragraphs: string[]; items?: string[] };
export type LegalDocument = { title: string; description: string; sections: LegalSection[] };

// Confirm these publication details with the operator before making this draft effective.
export const legalPublication = {
  updated: "3 October 2026",
  effective: "Pending final review",
  operator: null as string | null,
  contactEmail: null as string | null,
  draft: true,
};

export const privacyNotice: LegalDocument = {
  title: "Privacy Notice",
  description: "What TeacherCo processes, why it is used, and the choices available to you.",
  sections: [
    { id: "scope", title: "1. About this notice", paragraphs: [
      "TeacherCo is an independent classroom productivity application for teachers and authorized educational professionals. This notice describes information handled when you create an account, organize classroom records, check assessments, or use other supported features.",
      "Classroom records can include information about children. Only provide records you are authorized to process, and follow your school's privacy requirements. A TeacherCo account does not itself authorize the collection or disclosure of learner information. Acknowledging this notice is not blanket consent on behalf of learners or their families.",
    ] },
    { id: "information", title: "2. Information we process", paragraphs: ["Depending on the features you use, TeacherCo processes:"], items: [
      "Account and profile information: your name, email address, login credentials managed by the authentication service, preferred name, school type, optional school name, grade levels taught, and language preferences.",
      "Classroom information: class and learner names, enrollment details, scores, grades, assessment answers, attendance, missing activities, competencies, teacher notes, and generated reports.",
      "Files and images you select: supported Excel workbooks, PDFs, Word documents, pasted records, and photographed answer sheets. These may contain personal information beyond the fields TeacherCo extracts.",
      "Service information: authentication sessions, preferences, import history, and technical information needed to operate and secure the service. Hosting and authentication services may maintain connection and security logs.",
    ] },
    { id: "purposes", title: "3. Why information is used", paragraphs: [
      "Information is used to create and secure accounts; provide classroom workspaces; import, match, and synchronize records; maintain learner profiles; calculate scores and classroom statistics; track attendance and competencies; answer classroom questions; and prepare reports for teacher review.",
      "Processing also supports troubleshooting, prevention of unauthorized access, and responses to data requests. Upload only what is needed for your educational purpose. The appropriate authority and lawful basis for processing classroom information depend on the school, the information, and its intended use.",
    ] },
    { id: "ai", title: "4. AI assistance and assessment photos", paragraphs: [
      "Selected features can use external AI services to interpret answer-sheet images or assist with explanations and report text when a provider is configured. Grades, score comparisons, averages, and attendance counts are calculated by software rather than independently decided by AI.",
      "The report explanation workflow is designed to replace learner names with reference codes when their identity is unnecessary. This does not mean every upload is anonymous: an assessment photo sent for recognition may still show names or other information printed on the page. Remove unnecessary identifying details before using image recognition.",
      "Settings → AI & privacy controls AI summaries and explanations and whether teacher notes may be included in supported requests. Notes are excluded by default. Photo recognition and browser dictation are separate features that you initiate; the summaries setting should not be understood as disabling every external processing feature.",
      "AI output can be inaccurate. Review recognized answers, summaries, and reports before relying on them. Manual score entry and classroom calculations do not require an AI explanation service.",
    ] },
    { id: "files-voice", title: "5. Files and voice input", paragraphs: [
      "Supported record importers read files in your browser and send the selected, structured classroom information to TeacherCo. Selecting a workbook for import does not by itself mean its original file has been stored on the server. Stored assessment photos are handled separately and can remain after recognition fails so you can review them manually.",
      "Settings includes an original-file retention preference. Its application depends on the upload workflow; it is not a guarantee that every image is automatically deleted after processing. Use the stored-file removal control to remove originals and answer-sheet photos already held in your workspace. Removing a source file does not remove the classroom records extracted from it.",
      "Optional voice input uses your browser's speech-recognition service with microphone permission. Your browser or its speech provider may process audio remotely under its own terms. TeacherCo's dictation feature receives recognized text and does not itself save an audio recording. Text you confirm can become part of your saved answer key.",
    ] },
    { id: "providers", title: "6. Storage and service providers", paragraphs: [
      "TeacherCo uses Supabase for account authentication, structured records, and private file storage. Application hosting providers handle the delivery and operation of the service. When enabled and configured, AI recognition or explanation providers receive the inputs needed for the requested feature. Browser speech providers handle voice recognition separately.",
      "Information may be processed outside the Philippines depending on the hosting region and the services used. The operator must confirm the production provider list, processing locations, and applicable safeguards before this draft is finalized. This notice does not promise a particular external provider's retention or model-training policy.",
      "Information may also need to be disclosed when required by applicable law or to address unauthorized access and protect the service. Classroom information is not made public by the act of uploading it.",
    ] },
    { id: "security-device", title: "7. Security and information on your device", paragraphs: [
      "TeacherCo uses authenticated access, account-based database access controls, and private storage for supported uploads. No online service can guarantee absolute security. Keep your credentials secure and use devices appropriate for confidential classroom records.",
      "Authentication cookies support sign-in sessions. Supported offline features can keep information in your browser's local database or cache. Settings → Offline provides controls for information stored on that device. Downloaded exports and copies on other devices remain under your control and are not removed by deleting the server copy.",
    ] },
    { id: "retention", title: "8. Retention and deletion", paragraphs: [
      "Saved classroom information remains available until it is removed using the supported deletion controls or another applicable retention process. The production retention schedule for account records, technical logs, and backups is still being finalized; this draft does not promise immediate permanent deletion from every system or backup.",
      "Deleting a class removes its associated classroom records and stored files through the application's deletion process. A learner linked to another class can remain in that other class. Deleting all classroom data keeps your account and preferences. Account closure is not currently a self-service control.",
      "Keep the official records required by your school outside TeacherCo. Export what you need before deleting classroom data, and separately manage copies you have downloaded or shared.",
    ] },
    { id: "controls", title: "9. Your controls", paragraphs: ["After signing in, Settings provides these controls:"], items: [
      "Profile and language settings to update your account information and preferences.",
      "AI & privacy settings for summaries, explanations, and supported use of teacher notes.",
      "Data & storage controls to export structured data as JSON, remove stored uploads, delete a class, or delete classroom data. The JSON export does not include original files or photos.",
      "Offline controls to clear supported locally stored information on the current device.",
    ] },
    { id: "rights", title: "10. Privacy rights and requests", paragraphs: [
      "Subject to applicable law and its conditions, individuals may have rights to information, access, correction, objection, erasure or blocking, data portability, and to file a complaint with the National Privacy Commission. You may also have a right to damages where the law provides it.",
      "A learner, parent, or authorized representative can contact the teacher or school responsible for the classroom record to clarify its use or request correction. Requests involving TeacherCo's own processing should use the operator contact below once it is published. Identity and authority may need to be verified before information is disclosed or changed.",
    ] },
    { id: "changes", title: "11. Changes to this notice", paragraphs: [
      "The last-updated date identifies this version. Material changes to information handling should be communicated before they take effect through an appropriate notice. Review the notice when using a new feature that processes additional information.",
    ] },
  ],
};

export const termsAndConditions: LegalDocument = {
  title: "Terms & Conditions",
  description: "The responsibilities and limits that apply when using TeacherCo.",
  sections: [
    { id: "acceptance", title: "1. Acceptance and eligibility", paragraphs: [
      "These Terms describe the proposed conditions for creating and using a TeacherCo account. This version is a draft pending final review and an effective date. Once effective, creating or using an account means agreeing to the Terms and acknowledging the Privacy Notice.",
      "TeacherCo accounts are intended for teachers and other authorized educational professionals. Learner information may be included in classroom records, but TeacherCo is not offering learner accounts through this signup flow.",
    ] },
    { id: "account", title: "2. Your account", paragraphs: [
      "Provide accurate account information, keep your login credentials secure, and do not share access in a way that exposes records to unauthorized people. You are responsible for activity you authorize through your account. Report suspected unauthorized access through the operator's contact channel once published.",
    ] },
    { id: "classroom-data", title: "3. Authority to use classroom information", paragraphs: [
      "You are responsible for ensuring that you are authorized to upload and process learner information through TeacherCo and that your use complies with applicable school policies and legal requirements. Obtain any approvals, notices, or permissions required for the particular records and processing involved.",
      "You or the relevant institution retain applicable rights to uploaded classroom content. TeacherCo receives only the permission needed to store, process, display, and export that content to provide the service and features you use. Uploading a class record does not transfer ownership of it to TeacherCo.",
    ] },
    { id: "decisions", title: "4. TeacherCo assists. Teachers decide.", paragraphs: [
      "TeacherCo is an assistive productivity tool. You remain responsible for reviewing classroom information and making professional educational decisions. Check imported names, column mappings, highest possible scores, answer keys, grading rules, and results before using them.",
      "Flags, patterns, and comparisons describe the records provided and the configured criteria. They do not independently decide whether a learner passes, fails, needs discipline, or should receive a particular intervention.",
    ] },
    { id: "ask-ai", title: "5. Ask and AI limitations", paragraphs: [
      "Ask helps you query and understand classroom information in natural language. Supported responses may use structured records, deterministic calculations, and AI-generated explanations when available. Responses can be incomplete or inaccurate when records are missing, outdated, incorrectly imported, or incorrectly mapped.",
      "AI-generated text and recognition results can contain errors. Review them against the source records. TeacherCo does not guarantee that AI assistance will be available for every request, and external AI or internet services can be unavailable. Supported non-AI features can remain usable subject to their own connection and service requirements.",
    ] },
    { id: "assessments-reports", title: "6. Assessment checking and reports", paragraphs: [
      "For supported answer formats, software compares confirmed answers with the teacher's answer key. Image recognition can misread a mark. Review uncertain or incorrectly recognized responses and confirm the answer key before relying on assessment results.",
      "Generated reports are drafts for teacher review based on the available classroom information. Verify the content before sharing it or using it for an official purpose. You remain responsible for recipients, disclosure permissions, and any corrections.",
    ] },
    { id: "official-records", title: "7. Independent from official school systems", paragraphs: [
      "TeacherCo is an independent teacher productivity application and is not an official DepEd system. It does not replace the Learner Information System (LIS), official school records, required grading processes, or school reporting systems. Maintain the records your institution requires.",
    ] },
    { id: "acceptable-use", title: "8. Acceptable use", paragraphs: ["Do not use TeacherCo to:"], items: [
      "Access another person's account or classroom information without authorization.",
      "Upload records you have no authority to process or use records for an unlawful purpose.",
      "Circumvent security controls, extract other users' information, or interfere with the service.",
      "Upload malware or abuse AI services, storage, or other infrastructure.",
    ] },
    { id: "service-rights", title: "9. Service rights and availability", paragraphs: [
      "Rights in the TeacherCo application, branding, and service materials remain with their respective owners, subject to applicable third-party and open-source licenses. These Terms do not transfer ownership of your classroom content to TeacherCo or ownership of the application to you.",
      "Maintenance, updates, third-party outages, and technical problems can interrupt access. TeacherCo does not promise uninterrupted operation or error-free outputs. Keep copies of important records and review exports. Nothing in these Terms excludes rights or responsibilities that applicable law does not allow to be excluded.",
    ] },
    { id: "suspension", title: "10. Suspension, closure, and stored data", paragraphs: [
      "Access may be restricted to address security abuse, unauthorized access, unlawful use, or serious violations of these Terms. Where appropriate and lawful, the operator should explain the reason and available next steps; urgent protective action may come first.",
      "Stopping use of the service does not automatically erase your records. Use the available export and deletion controls while you have access. Deleting classroom data does not close your account. Account closure and requests involving restricted accounts require operator assistance through the contact channel once published. Stored data remains subject to the Privacy Notice and applicable retention requirements.",
    ] },
    { id: "law-changes", title: "11. Governing law and changes", paragraphs: [
      "This draft is prepared for use in the Philippines and proposes Philippine law as the governing law, without removing any mandatory rights under applicable law. The operator and this provision must be confirmed before the Terms become effective.",
      "The effective and last-updated dates identify the applicable version. Material changes should be communicated with reasonable notice before taking effect. The Privacy Notice separately explains information handling and available privacy controls.",
    ] },
  ],
};
