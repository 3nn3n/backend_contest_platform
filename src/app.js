import express from "express"
import authRoutes from "./routes/auth.routes.js"
import contestRoutes from "./routes/contest.routes.js"

const app = express()
app.use(express.json())

app.use("/auth", authRoutes)
app.use("/contest", contestRoutes)

export default app
