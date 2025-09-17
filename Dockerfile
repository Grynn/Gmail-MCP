# Use Node.js LTS version
FROM node:20-alpine

# Add metadata labels
LABEL org.opencontainers.image.title="Email MCP Server"
LABEL org.opencontainers.image.description="MCP server for email operations using IMAP/SMTP"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/yourusername/emailMCP"
LABEL org.opencontainers.image.licenses="MIT"

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code and build
COPY . .
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN rm -rf src/ tsconfig.json && \
    npm prune --production

# Set environment variables
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R mcp:nodejs /app
USER mcp

# Expose no ports (MCP uses stdio)
# Health check (optional)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('MCP server healthy')" || exit 1

# Start the MCP server
CMD ["node", "dist/index.js"]