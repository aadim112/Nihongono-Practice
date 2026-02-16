# Fix for Render Deployment - Gunicorn Not Found

## Problem
Render can't find `gunicorn` command even though it's installed.

## Solutions

### Solution 1: Use Python Module Syntax (Recommended)

Change your **Start Command** in Render dashboard to:
```bash
python -m gunicorn app:app
```

This uses Python's module execution which ensures gunicorn is found.

### Solution 2: Use Full Path

Alternatively, use:
```bash
~/.local/bin/gunicorn app:app
```

### Solution 3: Use Flask Development Server (Temporary)

If gunicorn still doesn't work, you can temporarily use Flask's built-in server:
```bash
python app.py
```

**Note**: This is NOT recommended for production, but works for testing.

## Updated Render Configuration

### Build Command:
```bash
pip install --upgrade pip && pip install -r requirements.txt
```

### Start Command:
```bash
python -m gunicorn app:app
```

## Steps to Fix

1. Go to your Render dashboard
2. Click on your service
3. Go to "Settings" → "Build & Deploy"
4. Update **Start Command** to: `python -m gunicorn app:app`
5. Update **Build Command** to: `pip install --upgrade pip && pip install -r requirements.txt`
6. Click "Save Changes"
7. Manually trigger a new deploy

## Verify Installation

After deployment, check the build logs. You should see:
```
Successfully installed gunicorn-21.2.0
```

If gunicorn is installed but still not found, use Solution 1 (python -m gunicorn).
