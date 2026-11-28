async function authenticatePasswordToken(req, res) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    res.status(401).json({ message: "A valid password-login token is required" });
    return false;
  }

  const usersServiceUrl = (process.env.USERS_SERVICE_URL || "http://localhost:8082").replace(/\/+$/, "");
  try {
    const response = await fetch(`${usersServiceUrl}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: match[1] }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        console.error("Users service token verification failed:", response.status);
        res.status(503).json({ message: "Authentication is temporarily unavailable" });
        return false;
      }

      res.status(401).json({ message: "Invalid or expired password-login token" });
      return false;
    }

    const verification = await response.json();
    if (verification?.valid !== true || typeof verification.user?.id !== "string") {
      console.error("Users service returned an invalid token verification response");
      res.status(502).json({ message: "Unable to verify your account right now" });
      return false;
    }

    req.authenticatedUser = verification.user;
    return true;
  } catch (error) {
    console.error("Users service token verification request failed:", error);
    res.status(503).json({ message: "Authentication is temporarily unavailable" });
    return false;
  }
}

module.exports = authenticatePasswordToken;
