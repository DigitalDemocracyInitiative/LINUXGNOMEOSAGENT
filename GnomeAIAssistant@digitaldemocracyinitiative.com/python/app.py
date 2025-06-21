# python/app.py
from flask import Flask, request, jsonify
from transformers import pipeline
import logging

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)

# Load the model globally when the app starts
generator = None
try:
    logging.info("Loading model 'distilgpt2'...")
    generator = pipeline('text-generation', model='distilgpt2')
    logging.info("Model 'distilgpt2' loaded successfully.")
except Exception as e:
    logging.error(f"Error loading model: {e}")
    generator = None # Ensure generator is None if loading fails

@app.route('/process_text', methods=['POST'])
def process_text():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()

    user_text = data.get('text')
    raw_context = data.get('context')

    if not isinstance(raw_context, dict):
        if raw_context is not None: # Log if context is present but not a dict
            logging.warning(f"Context data is not a dictionary: {type(raw_context)}. Proceeding without context details.")
        # If raw_context is None (missing), it's handled by defaulting to {}
        context_data = {}
    else:
        context_data = raw_context

    if not user_text:
        return jsonify({"error": "Missing 'text' field in JSON payload."}), 400

    if generator is None:
        return jsonify({"error": "AI model not loaded. Please check server logs."}), 500

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
