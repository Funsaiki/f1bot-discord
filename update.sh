#!/bin/bash
cd "$(dirname "$0")"
git pull && npm run build && sudo systemctl restart f1bot && echo "Bot mis à jour et redémarré !" || echo "Erreur lors de la mise à jour."
