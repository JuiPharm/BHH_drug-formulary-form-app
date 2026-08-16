# Deploy Form App Update v1.1.0

1. Upload/replace the contents of this folder in the existing GitHub repository root.
2. Keep `js/config.js` API URL pointed to the existing Apps Script `/exec` deployment.
3. Push to `main` and wait for the existing GitHub Pages workflow.
4. Test the physician step:
   - required: name, professional title, department, specialty, urgency, urgency duration, proposal reason
   - optional: physician phone
   - `NON_URGENT` autofills `รอบการนำเสนอของคณะกรรมการ PTC` and locks duration
   - approvers remain optional, maximum 6
