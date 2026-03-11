using System.Threading.Tasks;

namespace Backend.Services
{
    public interface IVaultWriteLocker
    {
        Task WaitAsync();
        void Release();
    }
}
