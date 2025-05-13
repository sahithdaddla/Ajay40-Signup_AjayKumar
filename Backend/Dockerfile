FROM node:18.19.1

WORKDIR /app

# Install postgresql-client for wait script
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Create Uploads directory for multer
RUN mkdir -p /app/Uploads && chmod -R 777 /app/Uploads

# Copy and configure wait script
COPY wait-for-postgres.sh .
RUN chmod +x wait-for-postgres.sh

# Expose port
EXPOSE 3005

# Start the application with wait script
CMD ["./wait-for-postgres.sh", "postgres", "5432", "node", "server.js"]
