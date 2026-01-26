#!/bin/bash
# Test script to verify gmail-mcp skill configuration

echo "=== Gmail MCP Skill Test ==="
echo ""

# Check if Docker MCP secret is configured
echo "1. Checking Docker secret..."
if docker mcp secret ls 2>/dev/null | grep -q "gmail-mcp.email_password"; then
    echo "   ✓ Secret 'gmail-mcp.email_password' found"
else
    echo "   ✗ Secret 'gmail-mcp.email_password' NOT found"
    echo ""
    echo "   To add the secret:"
    echo "   echo 'xxxx xxxx xxxx xxxx' | docker mcp secret set gmail-mcp.email_password"
    exit 1
fi

# Check config file
echo ""
echo "2. Checking Docker MCP config..."
if [ -f ~/.docker/mcp/config.yaml ]; then
    if grep -q "gmail-mcp:" ~/.docker/mcp/config.yaml; then
        echo "   ✓ gmail-mcp found in config"
        EMAIL=$(grep -A1 "gmail-mcp:" ~/.docker/mcp/config.yaml | grep "email_address:" | awk '{print $2}')
        echo "   ✓ Email configured: $EMAIL"
    else
        echo "   ✗ gmail-mcp NOT found in config"
        exit 1
    fi
else
    echo "   ✗ Config file not found: ~/.docker/mcp/config.yaml"
    exit 1
fi

# Test MCP gateway connection
echo ""
echo "3. Testing MCP gateway connection..."
RESULT=$(timeout 10 docker mcp gateway run --servers gmail-mcp --dry-run 2>&1)
if echo "$RESULT" | grep -q "7 tools listed"; then
    echo "   ✓ MCP gateway connected successfully"
    echo "   ✓ 7 tools available"
else
    echo "   ✗ MCP gateway connection failed"
    echo "$RESULT" | grep -i error | head -3
    exit 1
fi

# List available tools
echo ""
echo "4. Available tools:"
echo "$RESULT" | grep -oP '(?<=name=)[^}]+' | sort -u || echo "   (Cannot list tools in dry-run mode)"

echo ""
echo "=== All checks passed! ==="
echo ""
echo "To use the skill:"
echo "  1. Ensure Docker MCP Gateway is running:"
echo "     docker mcp gateway run --servers gmail-mcp"
echo ""
echo "  2. In Claude Code/Codex, invoke any tool:"
echo "     - listMessages"
echo "     - findMessage"
echo "     - sendMessage"
echo "     - getMessage"
echo "     - downloadAttachments"
echo "     - peekMessage"
echo "     - headMessage"
