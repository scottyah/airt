#!/bin/bash
set -e

# AIRT Build & Deploy Script
# Combines build.sh and deploy.sh into a single command

REGISTRY="harbor.scottyah.com"
NAMESPACE="scottyah"
IMAGE_NAME="airt"
FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}"

# Parse flags
BUILD_ONLY=false
DEPLOY_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --build-only)
      BUILD_ONLY=true
      shift
      ;;
    --deploy-only)
      DEPLOY_ONLY=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./ship.sh [OPTIONS]"
      echo ""
      echo "Build and deploy AIRT to Kubernetes"
      echo ""
      echo "Options:"
      echo "  --build-only    Only build and push Docker image"
      echo "  --deploy-only   Only deploy to Kubernetes (skip build)"
      echo "  -h, --help      Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./ship.sh                  # Build and deploy"
      echo "  ./ship.sh --build-only     # Only build"
      echo "  ./ship.sh --deploy-only    # Only deploy"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# BUILD PHASE
if [ "$DEPLOY_ONLY" = false ]; then
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
fi

# DEPLOY PHASE
if [ "$BUILD_ONLY" = false ]; then
  echo "🎨 Deploying AIRT to Kubernetes..."
  echo ""

  # Apply Kubernetes configuration
  echo "Applying Kubernetes configuration..."
  kubectl apply -f k8s.yaml

  echo ""
  echo "Waiting for namespace to be ready..."
  kubectl wait --for=condition=Ready --timeout=10s namespace/airt 2>/dev/null || true

  echo ""
  echo "Restarting deployment..."
  kubectl rollout restart deployment/airt-dep -n airt

  echo ""
  echo "Waiting for rollout to complete..."
  kubectl rollout status deployment/airt-dep -n airt --timeout=300s

  echo ""
  echo "✅ Deployment complete!"
  echo ""
  echo "📊 Deployment status:"
  kubectl get pods -n airt
  echo ""
  kubectl get svc -n airt
  echo ""
  kubectl get ingress -n airt
  echo ""
  echo "🌍 Your site should be available at: https://airt.scottyah.com"
  echo ""
  echo "To view logs:"
  echo "  kubectl logs -f deployment/airt-dep -n airt"
  echo ""
  echo "To check pod status:"
  echo "  kubectl get pods -n airt"
  echo ""
fi

if [ "$BUILD_ONLY" = false ] && [ "$DEPLOY_ONLY" = false ]; then
  echo "✨ Build and deployment complete!"
fi
