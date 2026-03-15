import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pathname = window.location.pathname.toLowerCase();
const isSignupPage = pathname.endsWith("/signup.html") || pathname.endsWith("signup.html");
const isLoginPage = pathname.endsWith("/login.html") || pathname.endsWith("login.html");

if (isSignupPage) {
	const signupButton = document.getElementById("btn-signup");
	if (signupButton) {
		signupButton.addEventListener("click", handleSignup);
	}
}

if (isLoginPage) {
	const loginButton = document.getElementById("btn-login");
	if (loginButton) {
		loginButton.addEventListener("click", handleLogin);
	}
}

async function handleSignup(event) {
	event.preventDefault();

	const nameInput = document.getElementById("signup-name");
	const emailInput = document.getElementById("signup-email");
	const passwordInput = document.getElementById("signup-password");
	const selectedRoleInput = document.querySelector('input[name="signup-role"]:checked');
	const form = event.currentTarget?.closest("form");
	const messageEl = ensureAuthMessage(form);

	if (!nameInput || !emailInput || !passwordInput) {
		showMessage(messageEl, "Unable to find signup fields.", "error");
		return;
	}

	const name = nameInput.value.trim();
	const email = emailInput.value.trim();
	const password = passwordInput.value;
	const selectedRole = selectedRoleInput?.value || "tenant";

	if (!name || !email || !password) {
		showMessage(messageEl, "Please enter full name, email, and password.", "error");
		return;
	}

	showMessage(messageEl, "Creating account...", "info");

	const { data, error } = await supabaseClient.auth.signUp({
		email: email,
		password: password,
		options: {
			data: {
				full_name: name,
				role: selectedRole,
			},
		},
	});

	if (error) {
		console.error("Supabase signUp error:", error);
		showMessage(messageEl, error.message || "Unable to create account.", "error");
		return;
	}

	const userId = data?.user?.id;
	if (!userId) {
		showMessage(messageEl, "Account created. Please verify your email before continuing.", "info");
		return;
	}

	showMessage(messageEl, "Account created. Redirecting...", "success");
	await redirectByRole(userId);
}

async function handleLogin(event) {
	event.preventDefault();

	const emailInput = document.getElementById("login-email");
	const passwordInput = document.getElementById("login-password");
	const form = event.currentTarget?.closest("form");
	const messageEl = ensureAuthMessage(form);

	if (!emailInput || !passwordInput) {
		showMessage(messageEl, "Unable to find login fields.", "error");
		return;
	}

	const email = emailInput.value.trim();
	const password = passwordInput.value;

	if (!email || !password) {
		showMessage(messageEl, "Please enter your email and password.", "error");
		return;
	}

	showMessage(messageEl, "Logging you in...", "info");

	const { data, error } = await supabaseClient.auth.signInWithPassword({
		email,
		password,
	});

	if (error) {
		showMessage(messageEl, error.message || "Unable to login.", "error");
		return;
	}

	const userId = data?.user?.id;
	if (!userId) {
		showMessage(messageEl, "Login succeeded, but user profile could not be loaded.", "error");
		return;
	}

	showMessage(messageEl, "Login successful. Redirecting...", "success");
	await redirectByRole(userId);
}

async function redirectByRole(userId) {
	const role = await fetchProfileRole(userId);

	if (role === "tenant") {
		window.location.href = "tenant_dashboard.html";
		return;
	}

	if (role === "landlord") {
		window.location.href = "landlord_dashboard.html";
		return;
	}

	if (role === "admin") {
		window.location.href = "admin_dashboard.html";
		return;
	}

	window.location.href = "index.html";
}

async function fetchProfileRole(userId) {
	const byId = await supabaseClient
		.from("profiles")
		.select("role")
		.eq("id", userId)
		.maybeSingle();

	if (!byId.error && byId.data?.role) {
		return byId.data.role;
	}

	const byUserId = await supabaseClient
		.from("profiles")
		.select("role")
		.eq("user_id", userId)
		.maybeSingle();

	if (!byUserId.error && byUserId.data?.role) {
		return byUserId.data.role;
	}

	if (byId.error) {
		console.error("Error fetching role by id:", byId.error);
	}

	if (byUserId.error) {
		console.error("Error fetching role by user_id:", byUserId.error);
	}

	return null;
}

function ensureAuthMessage(form) {
	if (!form) {
		return null;
	}

	let messageEl = form.querySelector(".auth-message");
	if (messageEl) {
		return messageEl;
	}

	messageEl = document.createElement("p");
	messageEl.className = "auth-message";
	messageEl.style.marginTop = "0.4rem";
	messageEl.style.fontSize = "0.86rem";
	messageEl.style.fontWeight = "600";
	form.appendChild(messageEl);

	return messageEl;
}

function showMessage(element, message, type) {
	if (!element) {
		return;
	}

	element.textContent = message;

	if (type === "error") {
		element.style.color = "#b91c1c";
		return;
	}

	if (type === "success") {
		element.style.color = "#047857";
		return;
	}

	element.style.color = "#334155";
}
