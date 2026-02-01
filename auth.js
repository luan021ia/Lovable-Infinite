document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('auth-form');
    const keyInput = document.getElementById('license-key');
    const authButton = document.getElementById('auth-button');
    const buttonText = document.getElementById('button-text');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const toggleVisibility = document.getElementById('toggle-visibility');
    const eyeIcon = document.getElementById('eye-icon');

    // Toggle password visibility
    toggleVisibility.addEventListener('click', () => {
        const type = keyInput.type === 'password' ? 'text' : 'password';
        keyInput.type = type;

        if (type === 'text') {
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
        } else {
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    });

    // Hide messages
    function hideMessages() {
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    }

    // Show error
    function showError(message) {
        hideMessages();
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
    }

    // Show success
    function showSuccess(message) {
        hideMessages();
        successMessage.textContent = message;
        successMessage.classList.add('show');
    }

    // Set loading state
    function setLoading(loading) {
        if (loading) {
            authButton.disabled = true;
            buttonText.style.display = 'none';
            loadingSpinner.style.display = 'block';
        } else {
            authButton.disabled = false;
            buttonText.style.display = 'block';
            loadingSpinner.style.display = 'none';
        }
    }

    // ============================================
    // VALIDAÇÃO DE CHAVE DE LICENÇA
    // ============================================

    async function validateKey(key) {
        return await validateKeySecure(key.trim());
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessages();

        const key = keyInput.value.trim();

        if (!key) {
            showError('Por favor, insira uma chave de licença');
            return;
        }

        setLoading(true);

        // Simular delay de rede
        await new Promise(resolve => setTimeout(resolve, 500));

        // Validar chave
        const result = await validateKey(key);

        setLoading(false);

        if (result.valid) {
            showSuccess(result.message);

            // Salvar chave e status de autenticação
            await chrome.storage.local.set({
                licenseKey: key,
                isAuthenticated: true,
                authTimestamp: new Date().toISOString(),
                userData: result.userData || {}
            });

            // Redirecionar para a página principal após 1 segundo
            setTimeout(() => {
                window.location.href = 'popup.html';
            }, 1000);

        } else {
            showError(result.message);
            keyInput.value = '';
            keyInput.focus();
        }
    });

    // Auto-focus no input
    keyInput.focus();
});
