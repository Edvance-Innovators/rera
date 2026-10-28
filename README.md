# ReRa – Hyper-Local EdTech Matching Platform

Welcome to **ReRa**, a comprehensive, hyper-local field dispatch and education management platform tailored specifically for the East African academic landscape. 

Inspired by agile mobile dispatch software, ReRa acts as the definitive bridge connecting **Learners**, **Parents**, and **Teachers** through an authorized **Manager (The Middleman Company)**. ReRa specializes in matching the closest qualified educators to students for tailored academic support spanning from **Primary school to University levels**, across all subjects and regional curricula.

---

## 🌍 Targeted Geographic Zone & Curricula
ReRa is custom-built to support the unique, diverse educational systems of **East Africa**. The platform dynamically adapts to the specific national curricula, grading systems, and regional zones of:
*   🇷🇼 **Rwanda** (REB & Cambridge/IB)
*   🇰🇪 **Kenya** (CBC & 8-4-4)
*   🇺🇬 **Uganda** (UNEB)
*   🇹🇿 **Tanzania** (NECTA)

The welcome page cycles through learning environments tagged with their country and curriculum. Signed-in users can open **Closer to home** to view approximate locations of verified, available educators within a selected radius; the search defaults to 10 km and requires browser location access.

The welcome page also suggests an AI study partner for each regional learning template and links to examples including RemNote AI, Khanmigo, NotebookLM, ChatGPT Study Mode and Quizlet. These are independent third-party tools, not built-in ReRa integrations; learners should use them as extra practice alongside a human educator and review age, privacy and cost requirements with a parent or educator. ReRa's own guided AI tutor is marked as coming soon.

---

## 👥 The Four Dedicated Portals (Spaces)

### 1. 🏢 The Manager Space (The Middleman Company Dashboard)
The central command center of the platform. Managers act as the absolute coordinators of the educational ecosystem to maintain quality control and data privacy.
*   **Hyper-Local Proximity Mapping:** A real-time dispatch dashboard where managers can visually locate teachers within a specific radius of a learner's house or school.
*   **Family Directory:** A manager-only view that maps registered parent accounts to their learner profiles and open tutoring requests, with teacher recommendations available from each request.
*   **Curriculum & Level Filtering:** Advanced search matrices allowing managers to filter educators by country-specific curricula (e.g., CBC vs. REB), academic levels (Primary, Secondary, University), and targeted subject expertise.
*   **Manager-led matching:** Managers review each request, shortlist verified educators by curriculum, level, subject and location, then privately pitch an educator. After the educator accepts, ReRa coordinates the family introduction; learner details stay private until then.
*   **Escrow & Billing Management:** Oversees local payment integrations (Mobile Money like MTN MoMo, Airtel Money, and card payments) and processes payouts to teachers upon successful lesson delivery.

### 2. 🎒 The Learner Space (The Student Portal)
Designed strictly for learning engagement, academic progression, and safety.
*   **Academic Level Selection:** Students can self-identify or update their exact level—from primary foundational numbers to complex university course codes.
*   **Interactive Schedule:** A calendar detailing upcoming in-person home visits or digital sessions.
*   **Assignment & Resource Locker:** A direct repository to download worksheets, syllabus guides, or past papers provided by their matched teacher.
*   **Direct Feedback Loop:** A simple, emoji-supported rating system for younger learners or comprehensive text reviews for university students to log session quality.

### 3. 👨‍👩‍👧 The Parent Space (The Customer Portal)
The logistical, financial, and oversight hub for the family.
*   **Request Intake Engine:** Parents submit requests outlining the student's current school level, struggling subjects, and physical address.
*   **Curated Recommendations Feed:** A space to review authorized, vetted profiles of nearby teachers recommended by the ReRa Manager.
*   **Progress Tracking & Reports:** Transparent logs of what was covered in each session, attendance verification, and performance milestones.
*   **Secure Payments Vault:** Handles seamless subscription or pay-per-session transactions using local East African payment gateways.

### 4. 🎓 The Teacher Space (The Educator App)
A mobile-first interface optimized for local gig-economy educators and professional teachers.
*   **Radius Settings & Availability:** Tutors can toggle their operating zone (e.g., "Within 5km of Gasabo, Kigali" or "Westlands, Nairobi") and update free hours.
*   **Private Job Pipeline:** Receives incoming notification pings from Managers offering nearby tutoring gigs. Tutors can view the curriculum, level, and subjects required, then click to accept or decline.
*   **Navigation Assistance:** In-app mapping (via Google Maps/OpenStreetMap) to easily navigate to the learner’s home or designated study center.
*   **Curriculum-Specific Toolkit:** A portal to view specific national syllabi guidelines, ensuring lessons align perfectly with what the student faces in school.

---

## Confirmation email setup

Confirmation emails are sent through Resend. Verify a sending domain in Resend, then configure an approved sender address as `MAIL_FROM`, for example `ReRa <no-reply@mail.example.com>`. Do not use `onboarding@resend.dev` for production recipients; Resend's test sender is restricted to testing.

Accounts remain pending until the confirmation link is used. If confirmation email delivery fails, the pending account is removed immediately so the address can be used to sign up again. Otherwise, unconfirmed accounts are automatically removed after 48 hours. Confirmed accounts are not affected.

Set `RESEND_API_KEY` as a secret on the same Cloudflare Worker environment that serves the site (production or preview). The sender address is configured as the non-secret `MAIL_FROM` Worker variable in `wrangler.jsonc`. For another environment, set it in the Cloudflare dashboard:

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Enter the Resend API key at the prompt, then deploy the Worker. Verify that the sender domain is approved in Resend. If a setting is missing, signup identifies its name. If Resend rejects an email, signup reports the HTTP status and the Worker logs record it. The user can retry with **Resend confirmation email** after correcting the configuration.
