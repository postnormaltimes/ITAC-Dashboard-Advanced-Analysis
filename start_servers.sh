#!/bin/bash

# start_servers.sh
# One-click script to start the ITAC Shadow Dashboard environment.

echo "Starting ITAC Shadow Dashboard..."

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null
    if [ $? -eq 0 ]; then
        echo "Port $1 is already in use. Killing process..."
        kill -9 $(lsof -t -i:$1)
    fi
}

# Cleanup existing processes on standard ports
echo "Cleaning up ports 8000 (Backend) and 5173 (Frontend)..."
check_port 8000
check_port 5173

# Start Backend
echo "Starting Backend (Port 8000)..."
cd backend
nohup uvicorn app.main:app --reload --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo "Backend started with PID $BACKEND_PID. Logs: backend.log"

# Start Frontend
echo "Starting Frontend (Port 5173)..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "Frontend started with PID $FRONTEND_PID. Logs: frontend.log"

echo "---------------------------------------------------"
echo "Dashboard is reachable at: http://localhost:5173"
echo "Backend API is reachable at: http://localhost:8000"
echo "---------------------------------------------------"
echo "To stop servers, run: kill $BACKEND_PID $FRONTEND_PID"
