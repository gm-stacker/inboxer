using System.Threading;
using System.Threading.Tasks;

namespace Backend.Services
{
    public class VaultWriteLocker : IVaultWriteLocker
    {
        private readonly SemaphoreSlim _writeLock = new SemaphoreSlim(1, 1);

        public Task WaitAsync()
        {
            return _writeLock.WaitAsync();
        }

        public void Release()
        {
            _writeLock.Release();
        }
    }
}
