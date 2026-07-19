//go:build js && wasm

package storage

import (
	"fmt"

	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

// NewS3StorageProviderFromConfig is unavailable under js/wasm: the AWS SDK
// would run inside the browser and expose storage credentials to it, which
// contradicts the credential-isolation contract. The registry skips providers
// whose constructor errors, so s3 roots surface as unregistered.
func NewS3StorageProviderFromConfig(provider config.ProviderConfig, accounts []config.StorageAccountConfig) (StorageProvider, error) {
	return nil, fmt.Errorf("s3 provider '%s' is not supported in the WebAssembly build", provider.ID)
}
