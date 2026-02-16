# Deploying to Render

## Render Configuration

### Root Directory
```
Backend
```

### Build Command
```bash
pip install -r requirements.txt
```

### Start Command
```bash
gunicorn app:app
```

## Step-by-Step Deployment

### 1. Create a New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (or use Render's Git integration)

### 2. Configure the Service

**Basic Settings:**
- **Name**: `japanese-practice-backend` (or your preferred name)
- **Environment**: `Python 3`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your main branch)

**Build & Deploy:**
- **Root Directory**: `Backend` ⬅️ **This is important!**
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app`

### 3. Environment Variables

Add these in Render's Environment Variables section:

**Required:**
- `GOOGLE_GENERATIVE_AI_API_KEY` = Your Google Generative AI API key

**Optional (with defaults):**
- `FLASK_ENV` = `production`
- `FLASK_DEBUG` = `False`
- `FLASK_HOST` = `0.0.0.0`
- `FLASK_PORT` = `10000` (Render uses port 10000 by default)
- `CORS_ORIGINS` = Your frontend URL (e.g., `https://your-frontend.onrender.com`)

### 4. Deploy

Click "Create Web Service" and Render will:
1. Clone your repository
2. Install dependencies from `requirements.txt`
3. Start your app with gunicorn
4. Provide you with a URL like `https://your-app.onrender.com`

## Important Notes

1. **Root Directory**: Must be `Backend` (not the project root)
2. **Port**: Render automatically sets `PORT` environment variable. Your app should use it:
   ```python
   port = int(os.getenv('PORT', os.getenv('FLASK_PORT', 5000)))
   ```
3. **CORS**: Update `CORS_ORIGINS` to your frontend domain
4. **Free Tier**: Render's free tier spins down after inactivity. First request may be slow.

## Updating Your Frontend

After deployment, update your frontend `.env`:
```
REACT_APP_API_URL=https://your-backend.onrender.com
```

## Troubleshooting

- **Build fails**: Check that `requirements.txt` is in the `Backend` folder
- **App crashes**: Check logs in Render dashboard
- **CORS errors**: Make sure `CORS_ORIGINS` includes your frontend URL
- **Port errors**: Render uses port from `PORT` env var, make sure your code reads it
