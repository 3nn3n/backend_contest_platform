import "dotenv/config"
import app from "./app.js"
import { pool, initializeDatabase } from "./db/index.js"

const PORT = process.env.PORT || 3001

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`)
    })
  })
  .catch(err => {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  })