#!/bin/bash
# Arranca backend y frontend en paralelo

echo "Arrancando Bulkhead..."

# Backend
cd backend
source venv/Scripts/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "  Ctrl+C para parar todo"

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
