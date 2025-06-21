#!/bin/bash

# Log file for the script's output
LOG_FILE="test_log.txt"
exec &> >(tee -a "$LOG_FILE")

# Log file for the backend server
SERVER_LOG_FILE="python/server.log"
PYTHON_APP_PATH="python/app.py"
BASE_URL="http://localhost:5000"
BACKEND_PID=""

echo "----------------------------------------------------"
echo "Starting GNOME AI Assistant Test Script"
echo "Timestamp: $(date)"
echo "----------------------------------------------------"

# Ensure python directory exists
if [ ! -d "python" ]; then
    echo "Error: 'python' directory not found. Make sure you are in the LINUXGNOMEOSAGENT root."
    exit 1
fi

# Ensure the python app exists
if [ ! -f "$PYTHON_APP_PATH" ]; then
    echo "Error: Python backend script '$PYTHON_APP_PATH' not found."
    exit 1
fi

# Function to clean up and stop the backend server
cleanup() {
    echo ""
    echo "----------------------------------------------------"
    echo "Cleaning up..."
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend server (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        # Wait a moment for the process to terminate
        sleep 2
        if ps -p $BACKEND_PID > /dev/null; then
            echo "Backend server did not stop gracefully, sending SIGKILL..."
            kill -9 $BACKEND_PID
        else
            echo "Backend server stopped."
        fi
    else
        echo "Backend PID not found, skipping kill."
    fi
    echo "Test script finished."
    echo "----------------------------------------------------"
}

# Set trap to call cleanup function on script exit (normal or interrupt)
trap cleanup EXIT SIGINT SIGTERM

# 1. Start the Flask Backend
echo ""
echo "Step 1: Starting the Flask backend server..."
# Create server log directory if it doesn't exist
mkdir -p "$(dirname "$SERVER_LOG_FILE")"
touch "$SERVER_LOG_FILE" # Ensure log file exists for tail

if [ -f "$SERVER_LOG_FILE" ]; then
    echo "Clearing previous server log: $SERVER_LOG_FILE"
    > "$SERVER_LOG_FILE"
fi

# Start the server in the background
(cd python && python3 app.py &> "../$SERVER_LOG_FILE" &)
BACKEND_PID=$!

if [ -z "$BACKEND_PID" ]; then
    echo "ERROR: Failed to start backend server."
    exit 1
fi
echo "Backend server started with PID: $BACKEND_PID. Logging to: $SERVER_LOG_FILE"
echo "Waiting a few seconds for the server to initialize..."
sleep 5 # Initial wait for server to start up

# 2. Wait for Backend Readiness
echo ""
echo "Step 2: Waiting for backend readiness..."
MAX_RETRIES=20 # Approx 20 * 3 = 60 seconds
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Attempting to connect to backend (Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    # We expect a 400 or 500 error if 'text' is missing, or 200 if it processes an empty request (depends on backend)
    # A connection refused error means it's not up yet.
    RESPONSE_CODE=$(curl --silent --output /dev/null --write-out "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"text": "ping"}' $BASE_URL/process_text)

    if [ "$RESPONSE_CODE" -eq 200 ] || [ "$RESPONSE_CODE" -eq 400 ] || [ "$RESPONSE_CODE" -eq 500 ] ; then
        echo "Backend is responsive (HTTP Code: $RESPONSE_CODE)."
        break
    else
        echo "Backend not ready yet (HTTP Code: $RESPONSE_CODE). Retrying in 3 seconds..."
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 3
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Backend server did not become ready after $MAX_RETRIES attempts."
    echo "Please check $SERVER_LOG_FILE for errors."
    exit 1
fi

# 3. Enable GNOME Extension
echo ""
echo "Step 3: Enabling GNOME Extension..."
EXTENSION_ID="GnomeAIAssistant@digitaldemocracyinitiative.com"
if gnome-extensions list --enabled | grep -q "$EXTENSION_ID"; then
    echo "Extension '$EXTENSION_ID' is already enabled."
else
    echo "Attempting to enable extension: $EXTENSION_ID"
    gnome-extensions enable "$EXTENSION_ID"
    if [ $? -eq 0 ]; then
        echo "Successfully sent command to enable extension."
        echo "Please verify in GNOME if the extension icon appears in the top panel."
    else
        echo "Warning: Failed to execute gnome-extensions enable command. The extension might not be installed correctly, or you might be in a non-graphical environment."
        echo "You may need to enable it manually via the GNOME Extensions app."
    fi
fi
# Give a moment for the extension to potentially load
sleep 3

# 4. Simulate User Input (Basic Text Query)
echo ""
echo "Step 4: Simulating basic user input (direct POST to backend)..."
echo "Note: Full UI simulation (e.g., typing in the GNOME extension's text field and clicking buttons) is complex and beyond the scope of this basic alpha test script. Manual testing is required for UI interaction."

TEST_QUERY='{"text": "What is the capital of France?", "context": {"window_title": "Test Script", "clipboard_content": "Some test clipboard data"}}'
echo "Sending query to backend: $TEST_QUERY"
curl_response_text=$(curl --silent -X POST -H "Content-Type: application/json" -d "$TEST_QUERY" $BASE_URL/process_text)

if [ $? -eq 0 ]; then
    echo "Backend response for text query:"
    echo "$curl_response_text"
    # Basic check for expected part of response (adapt if backend response structure is known)
    if echo "$curl_response_text" | grep -iq "Paris"; then
        echo "SUCCESS: Backend response seems to contain expected information for 'Capital of France'."
    else
        echo "NOTE: Backend response for text query did not contain 'Paris'. This might be okay depending on the model's current output or if it's a non-question task."
    fi
else
    echo "ERROR: Failed to send text query to backend."
fi

# 5. Simulate an Action Prompt
echo ""
echo "Step 5: Simulating an action prompt (direct POST to backend)..."
ACTION_QUERY='{"text": "Open Firefox", "context": {"window_title": "Test Script Action"}}'
echo "Sending action query to backend: $ACTION_QUERY"
curl_response_action=$(curl --silent -X POST -H "Content-Type: application/json" -d "$ACTION_QUERY" $BASE_URL/process_text)

if [ $? -eq 0 ]; then
    echo "Backend response for action query:"
    echo "$curl_response_action"
    # This part of the test primarily verifies the backend's action detection.
    # The script cannot automatically click the confirmation dialog in GNOME.
    if echo "$curl_response_action" | grep -iq "action" ; then # Assuming response contains an 'action' field
         echo "SUCCESS: Backend response suggests an action was detected."
         echo "MANUAL STEP REQUIRED: If the extension is working, a confirmation dialog should appear on your GNOME desktop to 'Open Firefox'. Please check and confirm/cancel it manually."
    else
        echo "WARNING: Backend response for action query did not seem to indicate a detected action. Check backend logic."
    fi
else
    echo "ERROR: Failed to send action query to backend."
fi

echo ""
echo "----------------------------------------------------"
echo "Basic tests complete."
echo "Please check $LOG_FILE for detailed logs of this script."
echo "Please check $SERVER_LOG_FILE for backend server logs."
echo "Further manual testing of the GNOME UI interactions is recommended."
echo "----------------------------------------------------"

# Cleanup will be called automatically on exit by the trap
exit 0
