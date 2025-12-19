#!/bin/bash
set -e

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
