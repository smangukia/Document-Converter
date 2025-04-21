FROM node:18-alpine

WORKDIR /app



# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Set environment variables
ENV NODE_ENV=production
# Frontend Environment Variables
ENV VITE_API_URL=http://44.206.167.8:3001/api
ENV VITE_SUPABASE_URL=https://jfrrhmdvkozujnspvdez.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcnJobWR2a296dWpuc3B2ZGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMTE4ODgsImV4cCI6MjA2MDU4Nzg4OH0.HFYYFGU5jatsJnJTwym7kI-jAKr4oRhmmL-rY3dvDj8
# Build the application
RUN npm run build

# Expose port
EXPOSE 5173

# Start the application using Vite's preview server
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
