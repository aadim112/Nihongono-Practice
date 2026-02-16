# Environment Setup Guide

This project uses environment variables to store sensitive configuration like API keys.

## Frontend (.env in root directory)

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Firebase configuration:
   - All `REACT_APP_FIREBASE_*` variables from your Firebase project
   - `REACT_APP_API_URL`: Your backend API URL (e.g., `http://localhost:5000` for development)

**Important**: React requires the `REACT_APP_` prefix for environment variables to be accessible in the browser.

## Backend (.env in Backend directory)

1. Navigate to the Backend directory:
```bash
cd Backend
```

2. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Edit `.env` and add your API keys:
   - `GOOGLE_GENERATIVE_AI_API_KEY`: Your Google Generative AI API key
   - Configure Flask settings as needed

4. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Security Notes

- **Never commit `.env` files to Git** - they contain sensitive API keys
- `.env` files are already in `.gitignore`
- Use `.env.example` files as templates (these are safe to commit)
- For production, set environment variables directly on your hosting platform

## Getting API Keys

### Google Generative AI API Key
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Add it to `Backend/.env`

### Firebase Configuration
1. Go to https://console.firebase.google.com/
2. Select your project
3. Go to Project Settings > General
4. Scroll down to "Your apps" and copy the config
5. Add values to root `.env` file
