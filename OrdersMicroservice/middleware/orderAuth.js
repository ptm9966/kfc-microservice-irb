async function authenticateOrderUser(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ message: "A valid password-login token is required" });
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
        return res.status(503).json({ message: "Order authentication is temporarily unavailable" });
      }
      return res.status(401).json({
        message: "Order history currently requires a valid mobile/password sign-in",
      });
    }

    const verification = await response.json();
    const userId = verification?.valid ? verification.user?.id : null;
    if (typeof userId !== "string" || !userId.trim()) {
      console.error("Users service returned an invalid token verification response");
      return res.status(502).json({ message: "Unable to verify your account right now" });
    }

    req.orderUserId = userId;
    req.orderUser = verification.user;
    return next();
  } catch (error) {
    console.error("Users service token verification request failed:", error);
    return res.status(503).json({ message: "Order authentication is temporarily unavailable" });
  }
}

module.exports = authenticateOrderUser;
