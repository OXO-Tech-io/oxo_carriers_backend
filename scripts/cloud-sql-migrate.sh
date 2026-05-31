#!/bin/bash

# Cloud SQL Migration Helper Script
# This script helps run Drizzle migrations against Cloud SQL instances
# 
# Usage:
#   ./scripts/cloud-sql-migrate.sh          # Run migrations with current env
#   ./scripts/cloud-sql-migrate.sh push     # Push schema to database
#   ./scripts/cloud-sql-migrate.sh generate # Generate new migration
#   ./scripts/cloud-sql-migrate.sh studio   # Open Drizzle Studio

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi

# Get the command (default is 'migrate')
COMMAND=${1:-migrate}

# Check if CLOUD_SQL_CONNECTION_NAME is set
if [ -z "$CLOUD_SQL_CONNECTION_NAME" ]; then
  echo -e "${RED}❌ CLOUD_SQL_CONNECTION_NAME is not set${NC}"
  echo -e "${YELLOW}Please set CLOUD_SQL_CONNECTION_NAME in your .env file${NC}"
  echo "Format: PROJECT_ID:REGION:INSTANCE_NAME"
  exit 1
fi

# Parse Cloud SQL connection name
IFS=':' read -r PROJECT_ID REGION INSTANCE_NAME <<< "$CLOUD_SQL_CONNECTION_NAME"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Cloud SQL Migration Helper${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Instance: $INSTANCE_NAME"
echo "  Database: $DB_NAME"
echo "  Schema: ${DB_SCHEMA:-public}"
echo "  User: $DB_USER"
echo ""

# Check if Cloud SQL Proxy is running
check_proxy() {
  if nc -z 127.0.0.1 5432 2>/dev/null; then
    echo -e "${GREEN}✓ Cloud SQL Proxy is running on localhost:5432${NC}"
    return 0
  else
    echo -e "${RED}⚠ Cloud SQL Proxy is NOT running on localhost:5432${NC}"
    echo -e "${YELLOW}Note: The proxy is optional - Drizzle can connect via Unix socket${NC}"
    return 1
  fi
}

# Start Cloud SQL Proxy if not running (optional)
start_proxy_if_needed() {
  if ! check_proxy; then
    echo ""
    echo -e "${YELLOW}Would you like to start Cloud SQL Proxy? (y/n)${NC}"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
      echo -e "${BLUE}Starting Cloud SQL Proxy...${NC}"
      gcloud sql proxy "$CLOUD_SQL_CONNECTION_NAME" \
        --use-http-health-check &
      PROXY_PID=$!
      sleep 2
      
      if check_proxy; then
        echo -e "${GREEN}✓ Cloud SQL Proxy started successfully${NC}"
        trap "kill $PROXY_PID 2>/dev/null || true" EXIT
      else
        echo -e "${RED}Failed to start Cloud SQL Proxy${NC}"
        exit 1
      fi
    else
      echo -e "${YELLOW}Continuing without proxy - using Unix socket connection${NC}"
    fi
  fi
}

# Run the requested command
case $COMMAND in
  migrate)
    echo -e "${BLUE}Running database migrations...${NC}"
    start_proxy_if_needed
    pnpm run db:migrate
    echo -e "${GREEN}✓ Migrations completed${NC}"
    ;;
  
  push)
    echo -e "${BLUE}Pushing schema changes to database...${NC}"
    start_proxy_if_needed
    pnpm run db:push
    echo -e "${GREEN}✓ Schema pushed${NC}"
    ;;
  
  generate)
    echo -e "${BLUE}Generating new migration...${NC}"
    pnpm run db:generate
    echo -e "${GREEN}✓ Migration generated${NC}"
    ;;
  
  studio)
    echo -e "${BLUE}Opening Drizzle Studio...${NC}"
    start_proxy_if_needed
    pnpm run db:studio
    ;;
  
  status)
    echo -e "${BLUE}Checking Cloud SQL connection...${NC}"
    check_proxy
    echo ""
    echo -e "${YELLOW}Environment Variables:${NC}"
    echo "  CLOUD_SQL_CONNECTION_NAME: $CLOUD_SQL_CONNECTION_NAME"
    echo "  DB_SOCKET_PATH: ${DB_SOCKET_PATH:-not set}"
    echo "  DB_USER: $DB_USER"
    echo "  DB_NAME: $DB_NAME"
    echo "  DB_SCHEMA: ${DB_SCHEMA:-public}"
    ;;
  
  proxy-start)
    echo -e "${BLUE}Starting Cloud SQL Proxy...${NC}"
    gcloud sql proxy "$CLOUD_SQL_CONNECTION_NAME" \
      --use-http-health-check
    ;;
  
  proxy-stop)
    echo -e "${BLUE}Stopping Cloud SQL Proxy...${NC}"
    pkill -f "cloud_sql_proxy" || true
    echo -e "${GREEN}✓ Proxy stopped${NC}"
    ;;
  
  help)
    echo -e "${YELLOW}Available commands:${NC}"
    echo ""
    echo "  migrate         Run database migrations (default)"
    echo "  push            Push schema changes to database"
    echo "  generate        Generate a new migration"
    echo "  studio          Open Drizzle Studio UI"
    echo "  status          Check connection status"
    echo "  proxy-start     Start Cloud SQL Proxy"
    echo "  proxy-stop      Stop Cloud SQL Proxy"
    echo "  help            Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./scripts/cloud-sql-migrate.sh              # Run migrations"
    echo "  ./scripts/cloud-sql-migrate.sh push         # Push schema"
    echo "  ./scripts/cloud-sql-migrate.sh generate     # Generate migration"
    echo "  ./scripts/cloud-sql-migrate.sh status       # Check status"
    ;;
  
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    echo "Run '$0 help' for available commands"
    exit 1
    ;;
esac

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
