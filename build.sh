#!/bin/bash
set -e

REGISTRY="harbor.scottyah.com"
NAMESPACE="scottyah"
IMAGE_NAME="airt"
FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Tags
TAG_VERSION="${FULL_IMAGE}:${VERSION}"
TAG_TIMESTAMP="${FULL_IMAGE}:${TIMESTAMP}"
TAG_LATEST="${FULL_IMAGE}:latest"

echo "🎨 Building AIRT Docker image..."
echo "Registry: ${REGISTRY}"
echo "Image: ${FULL_IMAGE}"
echo "Version: ${VERSION}"
echo "Timestamp: ${TIMESTAMP}"
echo ""

# Build image
echo "Building Docker image..."
docker build \
  --network=host \
  -t "${TAG_VERSION}" \
  -t "${TAG_TIMESTAMP}" \
  -t "${TAG_LATEST}" \
  .

echo ""
echo "✅ Build complete!"
echo ""
echo "Tagged as:"
echo "  - ${TAG_VERSION}"
echo "  - ${TAG_TIMESTAMP}"
echo "  - ${TAG_LATEST}"
echo ""

# Push images
echo "Pushing images to registry..."
docker push "${TAG_VERSION}"
docker push "${TAG_TIMESTAMP}"
docker push "${TAG_LATEST}"

echo ""
echo "🚀 Images pushed to Harbor registry!"
echo ""
echo "To deploy, run: ./deploy.sh"
