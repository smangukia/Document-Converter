import express from "express"
import { saveUser, getUserById, updateUserLastLogin } from "../services/users"

const router = express.Router()

// Register or update user endpoint
router.post("/api/users", async (req, res) => {
  try {
    const { id, email, name, avatar_url, provider } = req.body

    if (!id || !email) {
      return res.status(400).json({ error: "User ID and email are required" })
    }

    const now = new Date().toISOString()

    // Check if user already exists
    const existingUser = await getUserById(id)

    if (existingUser) {
      // Only update last login time if it's been more than 5 minutes
      const lastLoginTime = new Date(existingUser.last_login).getTime()
      const currentTime = new Date().getTime()

      if (currentTime - lastLoginTime > 300000) {
        // 5 minutes in milliseconds
        console.log(`[USERS] Updating last login time for user ${id}`)
        await updateUserLastLogin(id)
        return res.status(200).json({ message: "User login recorded", user: existingUser })
      } else {
        console.log(`[USERS] Skipping update - last login was less than 5 minutes ago for user ${id}`)
        return res.status(200).json({ message: "User login already recorded recently", user: existingUser })
      }
    }

    // Create user object
    const user = {
      id,
      email,
      name: name || "",
      avatar_url: avatar_url || "",
      provider: provider || "google",
      last_login: now,
      created_at: now,
      updated_at: now,
    }

    // Save new user
    console.log(`[USERS] Creating new user with ID ${id}`)
    const success = await saveUser(user)

    if (success) {
      res.status(201).json({ message: "User registered successfully", user })
    } else {
      res.status(500).json({ error: "Failed to register user" })
    }
  } catch (error) {
    console.error("Error in /api/users:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user by ID endpoint
router.get("/api/users/:id", async (req, res) => {
  try {
    const id = req.params.id

    const user = await getUserById(id)

    if (user) {
      res.status(200).json(user)
    } else {
      res.status(404).json({ error: "User not found" })
    }
  } catch (error) {
    console.error("Error in GET /api/users/:id:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
