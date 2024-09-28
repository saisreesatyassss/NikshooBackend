To meet your requirements for the two forms with different endpoints, where anyone can post the form but only an admin can read or delete the form data, I'll create two sets of POST methods for form submissions and GET/DELETE methods for admin access.

### Setup

We'll assume:
1. `express` for the web framework.
2. `firebase-admin` or a similar service for admin verification and database handling.
3. Form data will be submitted via JSON.

Here’s how we can structure the routes:

---

### **Form 1: Project Enquiry Form**
- **POST:** `/enquiry/submit` (for submitting the form)
- **GET:** `/admin/enquiry` (for admin to read all submitted forms)
- **DELETE:** `/admin/enquiry/:id` (for admin to delete a specific form)

### **Form 2: Get In Touch Form**
- **POST:** `/contact/submit` (for submitting the form)
- **GET:** `/admin/contact` (for admin to read all submitted forms)
- **DELETE:** `/admin/contact/:id` (for admin to delete a specific form)

---
 
### Summary of Routes:

1. **Form 1: Project Enquiry**
   - POST: `/enquiry/submit`
   - GET (Admin Only): `/admin/enquiry`
   - DELETE (Admin Only): `/admin/enquiry/:id`

2. **Form 2: Get In Touch**
   - POST: `/contact/submit`
   - GET (Admin Only): `/admin/contact`
   - DELETE (Admin Only): `/admin/contact/:id`

### Key Points:
- Anyone can submit to `/enquiry/submit` and `/contact/submit`.
- Only admins can view or delete the form data through the `/admin/*` routes.
