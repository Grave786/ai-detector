# Deploy Guide (Render + Vercel)

## 1) Deploy backend on Render

Use this repository root as the service source. `render.yaml` is included.

Required environment variables in Render:

- `MONGO_URI`
- `MONGO_DB_NAME`
- `JWT_SECRET_KEY`
- `JWT_EXPIRE_MINUTES`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

Health endpoint:

- `GET /`

## 2) Deploy frontend on Vercel

Set project root directory to `frontend`.

After backend deploy, update:

- `frontend/config.js`
  - Replace `https://YOUR_RENDER_BACKEND_URL.onrender.com` with your Render API URL.

Then redeploy frontend.

## 3) Production safety checks

- Confirm backend has `AUTH_DISABLED=false`.
- Login with admin credentials.
- Create a user from admin panel.
- Run a text scan and verify response time and history update.

