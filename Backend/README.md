# Backend Setup Instructions

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and add your API keys:
   - `GOOGLE_GENERATIVE_AI_API_KEY`: Your Google Generative AI API key
   - `FLASK_HOST`: Host to run Flask on (default: 127.0.0.1)
   - `FLASK_PORT`: Port to run Flask on (default: 5000)
   - `FLASK_DEBUG`: Enable debug mode (True/False)
   - `CORS_ORIGINS`: Allowed CORS origins (use * for all, or comma-separated URLs)

## Running the Server

```bash
python app.py
```

The server will start on `http://127.0.0.1:5000` (or your configured host/port).

## Production Deployment

For production:
1. Set `FLASK_DEBUG=False`
2. Set `FLASK_HOST=0.0.0.0` (to accept connections from all interfaces)
3. Set `CORS_ORIGINS` to your specific frontend domain(s)
4. Use a production WSGI server like Gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```
