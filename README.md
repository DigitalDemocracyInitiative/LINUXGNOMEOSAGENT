# GNOME AI Assistant: An AI-Powered Productivity Tool for GNOME

GNOME AI Assistant is an alpha-stage AI-powered productivity tool integrated into the GNOME Shell environment. It aims to provide users with quick access to AI text generation, context-aware assistance, and basic command execution.

## Features

*   **AI-Powered Text Generation:** Leverage language models for tasks like summarization, translation, and creative writing.
*   **Context Awareness:** Utilizes the current window title and clipboard content to provide relevant assistance.
*   **Basic Command Execution:** Can launch applications and perform simple system commands (with user confirmation).

## Prerequisites

*   **GNOME Shell:** Version 42-46 (ensure compatibility with your specific version).
*   **Python:** Version 3.8 or newer.
*   **pip:** Python package installer (usually comes with Python).
*   **GNOME Shell Extension Manager:** Recommended for easy installation and management of the extension.

## Installation Instructions

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/DigitalDemocracyInitiative/LINUXGNOMEOSAGENT.git
    ```

2.  **Navigate into the Directory:**
    ```bash
    cd LINUXGNOMEOSAGENT
    ```

3.  **Install GNOME Extension:**
    *   Copy the extension directory:
        ```bash
        cp -r GnomeAIAssistant@digitaldemocracyinitiative.com ~/.local/share/gnome-shell/extensions/
        ```
    *   Restart GNOME Shell: Press `Alt+F2`, type `r` in the dialog, and press Enter. If this doesn't work (e.g., on Wayland), you may need to log out and log back in.

4.  **Install Python Dependencies:**
    *   Navigate to the Python directory:
        ```bash
        cd python
        ```
    *   Install dependencies:
        ```bash
        pip install -r requirements.txt
        ```
    *   **Note:** The first time you run the backend or install requirements, the `distilgpt2` model (or other specified models) will be downloaded. This may take some time depending on your internet connection.

## Running the Assistant

1.  **Start the Backend Server:**
    *   Navigate to the `python` directory if you aren't already there:
        ```bash
        cd /path/to/LINUXGNOMEOSAGENT/python # Or navigate from your current location
        ```
    *   Run the Python application:
        ```bash
        python app.py
        ```
    *   **Keep this terminal window open.** The backend server needs to be running for the extension to function.

2.  **Enable the GNOME Extension:**
    *   Open the GNOME Extensions application (usually found in your app grid) or use the GNOME Shell Extension Manager.
    *   Search for "GNOME AI Assistant".
    *   Enable the extension by toggling the switch.
    *   A new button/icon for the AI Assistant should appear in your top panel.

## Usage / Testing Instructions

1.  **Activate the Assistant:** Click the AI Assistant icon in the GNOME top panel. A text input field will appear.
2.  **Type Your Query:** Enter your request or question into the text field and press Enter.

    **Examples:**
    *   Copy a block of text to your clipboard, then type: `Summarize this text`
    *   `Open Firefox`
    *   `Launch Terminal`
    *   `What is the capital of France?`

3.  **Responses and Actions:**
    *   AI-generated text responses will appear as system notifications.
    *   If the assistant interprets your query as an action (e.g., "Open Firefox"), a confirmation dialog will appear. You must click "Confirm" for the action to be executed.

## Troubleshooting

*   **Extension Not Appearing in GNOME Extensions App:**
    *   Ensure you copied the `GnomeAIAssistant@digitaldemocracyinitiative.com` directory correctly to `~/.local/share/gnome-shell/extensions/`.
    *   Verify your GNOME Shell version is compatible (42-46). Check with `gnome-shell --version`.
    *   Make sure you've restarted GNOME Shell (`Alt+F2`, then `r`, or logout/login).

*   **Backend Not Starting or Not Responding:**
    *   Check if port `5000` is already in use by another application. You can change the port in `python/app.py` if needed.
    *   Ensure `pip install -r requirements.txt` (inside the `python` directory) completed successfully without errors.
    *   Look for error messages in the terminal where you ran `python python/app.py`.

*   **No AI Response / Extension Seems Unresponsive:**
    *   Verify the Python backend server (`python/app.py`) is still running in its terminal.
    *   Check if the extension is enabled in the GNOME Extensions app.
    *   Ensure your system can connect to `http://localhost:5000`. You can test this by opening this URL in a web browser (you should see a "Not Found" error or similar, which means the server is running but that specific path isn't directly browsable).

*   **Model Download Issues During `pip install`:**
    *   Ensure you have a stable internet connection.
    *   Firewall or proxy settings might be blocking the download.
    *   Try running `pip install -r requirements.txt` again.

## Known Limitations

*   **Limited Context Retrieval:** Full window content retrieval is not currently supported due to Wayland and X11 security restrictions. The assistant's context is primarily limited to the active window's title and the content of your clipboard.
*   **Action Confirmation:** All actions require explicit user confirmation via a dialog box for security reasons.
*   **Wayland vs. X11:** Some functionalities or workarounds might behave differently between Wayland and X11 sessions.

*Future work may explore integration with D-Bus-enabled applications (e.g., LibreOffice, text editors) for richer contextual understanding and more direct interaction, where permitted by application APIs.*

## Future Enhancements (Optional)

*   More robust intent and action detection.
*   Improved user interface and user experience.
*   Background loading of AI models to reduce initial startup time.
*   Support for more complex, multi-step commands.
*   Customizable user preferences.

---

*This is an alpha version. Expect bugs and incomplete features. Your feedback is valuable!*
