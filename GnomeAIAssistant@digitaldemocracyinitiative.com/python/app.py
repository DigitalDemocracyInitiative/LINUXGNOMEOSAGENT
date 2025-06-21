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

        return jsonify({"generated_text": generated_text}), 200
    except Exception as e:
        logging.error(f"Error during text generation: {e}")
        return jsonify({"error": "Error during text generation."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False) # debug=False for production readiness
