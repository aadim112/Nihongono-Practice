# Fix for Python 3.14 Compatibility Issue

## Problem
Render is using Python 3.14 which has compatibility issues with protobuf library:
```
TypeError: Metaclasses with custom tp_new are not supported.
```

## Solution

### Option 1: Specify Python Version in Render Dashboard (Recommended)

1. Go to your Render service → **Settings** → **Build & Deploy**
2. Find **Python Version** setting
3. Set it to: `3.12.7` (or `3.11.x`)
4. Save and redeploy

### Option 2: Use runtime.txt File

A `runtime.txt` file has been created in the Backend folder with:
```
python-3.12.7
```

Render should automatically detect this file and use Python 3.12.7.

### Option 3: Update render.yaml

The `render.yaml` has been updated to specify:
```yaml
pythonVersion: 3.12.7
```

## Why Python 3.12?

- Python 3.14 is very new and has compatibility issues with some libraries
- Python 3.12 is stable and well-supported by all dependencies
- Python 3.11 is also a good alternative

## Steps to Fix

1. **In Render Dashboard:**
   - Go to your service
   - Settings → Build & Deploy
   - Set **Python Version** to `3.12.7`
   - Save changes
   - Manually trigger a new deploy

2. **Or commit and push:**
   - The `runtime.txt` file should be automatically detected
   - Push your changes to trigger a new build

## Verify

After redeploying, check the build logs. You should see:
```
Using Python version 3.12.7
```

Instead of Python 3.14.
