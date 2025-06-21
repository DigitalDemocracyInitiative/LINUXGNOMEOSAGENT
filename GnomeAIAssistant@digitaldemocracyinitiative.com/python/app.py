# python/app.py
from flask import Flask, request, jsonify
from transformers import pipeline
import logging
import threading
import os

app = Flask(__name__)

# Configure logging
# Ensure the log file is created in the same directory as app.py
log_file_path = os.path.join(os.path.dirname(__file__), 'server.log')
logging.basicConfig(filename=log_file_path, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Global variable to hold the model and track its readiness
generator = None
model_ready = False
model_lock = threading.Lock()

def load_model():
    global generator, model_ready
    try:
        logging.info("Model loading started...")
        # Simulate model loading progress (optional, for demonstration)
        # For actual progress, this would depend on the model loading library
        for i in range(1, 6): # Simulate 5 steps of loading
            logging.info(f"Model loading: {i*20}%")
            threading.Event().wait(0.5) # Simulate time taken for each step

        temp_generator = pipeline('text-generation', model='distilgpt2')
        with model_lock:
            generator = temp_generator
            model_ready = True
        logging.info("Model loaded successfully.")
    except Exception as e:
        logging.error(f"Error loading model: {e}")
        # model_ready remains False
        # generator remains None

# Start loading the model in a background thread when the app starts
model_thread = threading.Thread(target=load_model)
model_thread.daemon = True # Allows main program to exit even if thread is still running
model_thread.start()

@app.route('/process_text', methods=['POST'])
def process_text():
    global model_ready, generator # Ensure we're using the global vars

    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    with model_lock: # Ensure thread-safe access to model_ready and generator
        if not model_ready:
            return jsonify({"error": "AI model is still loading, please wait."}), 503

        if generator is None: # Should ideally be covered by model_ready, but as a safeguard
            logging.error("Model is marked as ready, but generator is None. This indicates a critical issue.")
            return jsonify({"error": "AI model failed to load. Please check server logs."}), 500

    data = request.get_json()
    user_text = data.get('text')
    raw_context = data.get('context')

    if not isinstance(raw_context, dict):
        if raw_context is not None:
            logging.warning(f"Context data is not a dictionary: {type(raw_context)}. Proceeding without context details.")
        context_data = {}
    else:
        context_data = raw_context

    if not user_text:
        return jsonify({"error": "Missing 'text' field in JSON payload."}), 400

    # Extract context details, providing default empty strings
    active_window_title = context_data.get('active_window_title', '')
    clipboard_content = context_data.get('clipboard_content', '')

    # Construct a comprehensive prompt for the LLM
    # Ensure all context lines are present, even if values are empty
    full_prompt = (
        f"User query: {user_text}\n"
        f"Active Window Title: {active_window_title}\n"
        f"Clipboard Content: {clipboard_content}\n"
        "AI Assistant:"
    )

    try:
        # Generate text using the loaded model
        # Using max_new_tokens to control output length, and num_return_sequences for a single response
        # Using do_sample=True for more varied (less deterministic) output
        response = generator(full_prompt, max_new_tokens=150, num_return_sequences=1, do_sample=True)
        generated_text = response[0]['generated_text']

        # The model might repeat the prompt. Try to remove the prompt from the output.
        if generated_text.startswith(full_prompt):
            generated_text = generated_text[len(full_prompt):].strip()

        # Action detection logic
        requires_action = False
        suggested_command = None

        # Simple keyword matching for commands
        # Prioritize simple detection patterns:
        # "Open " followed by a common application name.
        # "Launch " followed by a common application name.
        # "Run `" followed by text ending with "`" (to capture specific shell commands).

        lower_generated_text = generated_text.lower() # Use lower case for case-insensitive matching

        common_apps = {
            "firefox": "firefox",
            "terminal": "gnome-terminal",
            "nautilus": "nautilus", # File manager
            "gedit": "gedit", # Text editor
            "settings": "gnome-control-center",
            "calendar": "gnome-calendar"
        }

        # Check for "Open <app>" or "Launch <app>"
        for action_verb in ["open ", "launch "]:
            if action_verb in lower_generated_text:
                potential_app_name = generated_text[lower_generated_text.find(action_verb) + len(action_verb):].split(' ')[0].lower().strip('.,?!"\'')
                if potential_app_name in common_apps:
                    requires_action = True
                    suggested_command = common_apps[potential_app_name]
                    break
            if requires_action:
                break

        # Check for "Run `command`"
        if not requires_action and "run `" in lower_generated_text:
            start_index = lower_generated_text.find("run `") + len("run `")
            end_index = generated_text.find("`", start_index)
            if end_index != -1:
                command = generated_text[start_index:end_index]
                # Basic validation: ensure command is not empty and does not contain another backtick
                if command.strip() and '`' not in command:
                    requires_action = True
                    suggested_command = command.strip()

        response_data = {"generated_text": generated_text}
        if requires_action:
            response_data["requires_action"] = True
            response_data["suggested_command"] = suggested_command
        else:
            response_data["requires_action"] = False
            # Omitting suggested_command when no action is required, or explicitly setting to None
            # response_data["suggested_command"] = None

        return jsonify(response_data), 200
    except Exception as e:
        logging.error(f"Error during text generation or action detection: {e}")
        return jsonify({"error": "Error during text generation or action detection."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False) # debug=False for production readiness
