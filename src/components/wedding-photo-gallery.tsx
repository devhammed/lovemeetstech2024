import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react'
import { User } from 'firebase/auth'
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { ref, list, getDownloadURL, getBlob, uploadBytes, StorageReference } from 'firebase/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Toaster, toast } from 'react-hot-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {Download, Upload} from 'lucide-react'
import { auth, storage } from '@/lib/firebase'
const appTitle = import.meta.env.VITE_APP_TITLE;

const maxResults = parseInt(import.meta.env.VITE_PHOTOS_PER_PAGE, 10);

interface PhotoItem {
  url: string;
  name: string;
  storageRef: StorageReference;
}

export function WeddingPhotoGalleryComponent() {
  const [email, setEmail] = useState<string>('');

  const [user, setUser] = useState<User|null>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const [loading, setLoading] = useState<boolean>(false);

  const [sendingSignInLink, setSendingSignInLink] = useState<boolean>(false);

  const [hasMore, setHasMore] = useState<boolean>(true);

  const [pageToken, setPageToken] = useState<string|undefined>();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [modalEmail, setModalEmail] = useState<string>('');

  const observer = useRef<IntersectionObserver>();

  const completeSignIn = useCallback(async (email: string) => {
    try {
      const result = await toast.promise(signInWithEmailLink(auth, email, window.location.href), {
        loading: 'Signing in...',
        success: 'Successfully signed in!',
        error: 'Error signing in. Please try again.'
      });

      window.localStorage.removeItem('emailForSignIn');

      window.history.replaceState({}, document.title, window.location.pathname);

      setUser(result.user);
    } catch (error) {
      console.error('Error signing in with email link', error);
      toast.error('Error signing in. Please try again.');
    }
  }, [setUser]);

  const sendSignInLink = useCallback(async (e: FormEvent) => {
    e.preventDefault();

    setSendingSignInLink(true);

    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.href,
        handleCodeInApp: true,
      });

      window.localStorage.setItem('emailForSignIn', email);

      toast.success('Sign-in link sent to your email!');
    } catch (error) {
      console.error('Error sending sign-in link', error);
      toast.error('Error sending sign-in link. Please try again.');
    }

    setSendingSignInLink(false);
  }, [email, setSendingSignInLink]);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);

    try {
      const listRef = ref(storage, 'photos');

      const res = await list(listRef, { maxResults, pageToken });

      const items = await Promise.all(res.items.map(storageRef => {
        return new Promise<PhotoItem>((resolve, reject) => {
          getDownloadURL(storageRef)
              .then(url => {
                resolve({ url, storageRef, name: storageRef.name });
              })
              .catch(error => {
                reject(error);
              });
        });
      }));

      setPhotos((prevPhotos) => pageToken ? [...prevPhotos, ...items] : items);

      setPageToken(res.nextPageToken);

      setHasMore(!!res.nextPageToken);
    } catch (error) {
      console.error('Error fetching photos', error);
      toast.error('Error fetching photos. Please try again.');
    }

    setLoading(false);
  }, [pageToken, setPhotos, setPageToken, setHasMore, setLoading]);

  const uploadImage = useCallback(async (file: File) => {
    try {
      const name = `${Date.now()}_${file.name}`;

      const storageRef = ref(storage, `photos/${name}`);

      await toast.promise(uploadBytes(storageRef, file), {
        loading: 'Uploading image...',
        success: 'Image uploaded successfully!',
        error: 'Error uploading image. Please try again.'
      });

      const url = await getDownloadURL(storageRef);

      setPhotos((prevPhotos) => [{url, name, storageRef}, ...prevPhotos]);
    } catch (error) {
      console.error('Error uploading image', error);
      toast.error('Error uploading image. Please try again.');
    }
  }, [setPhotos]);

  const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files![0];

    if (!file) {
      return;
    }

    await uploadImage(file);
  }, [uploadImage]);

  const handleModalSubmit = useCallback(async  (e: FormEvent) => {
    e.preventDefault();

    completeSignIn(modalEmail).catch(error => {
        console.error('Error completing sign-in', error);
        toast.error('Error completing sign-in. Please try again.');
    });

    setIsModalOpen(false);
  }, [completeSignIn, modalEmail]);

  const handleDownload = useCallback(async (photo: PhotoItem) => {
    try {
      const blob = await toast.promise(getBlob(photo.storageRef), {
        loading: 'Downloading image...',
        success: 'Image downloaded successfully!',
        error: 'Error downloading image. Please try again.'
      });

      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = blobUrl;

      a.download = photo.name;

      a.click();
    } catch (error) {
      console.error('Error downloading image', error);
      toast.error('Error downloading image. Please try again.');
    }
  }, []);

  const infiniteScrollRef = useCallback((node: HTMLDivElement) => {
    if (loading) {
      return;
    }

    if (observer.current) {
      observer.current.disconnect();
    }

    observer.current = new IntersectionObserver(async entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchPhotos().catch(error => {
          console.error('Error fetching photos', error)
          toast.error('Error fetching photos. Please try again.')
        });
      }
    });

    if (node) {
      observer.current.observe(node);
    }
  }, [loading, hasMore, fetchPhotos]);

  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email = window.localStorage.getItem('emailForSignIn');

      if (!email) {
        setIsModalOpen(true);
      } else {
         completeSignIn(email).catch(error => {
            console.error('Error completing sign-in', error);
            toast.error('Error completing sign-in. Please try again.');
         });
      }
    }
  }, [completeSignIn, setIsModalOpen]);

  useEffect(() => {
    const authStateSubscription = auth.onAuthStateChanged((user) => {
        setUser(user);
    });

    if (user) {
      fetchPhotos().catch(error => {
        console.error('Error fetching photos', error);
        toast.error('Error fetching photos. Please try again.');
      });
    }

    return authStateSubscription;
  }, [fetchPhotos, user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/30 border border-blue-200 shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 md:text-3xl">
              {appTitle}
            </h2>

            <p className="text-center text-blue-600 mb-6">
              Share your royal moments with us! 📸
            </p>

            <form onSubmit={sendSignInLink} className="space-y-4">
              <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/50 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
              />
              <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={sendingSignInLink}
              >
                {sendingSignInLink ? 'Sending...' : ' Send Sign-In Link'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="bg-white/80 backdrop-blur-sm border border-blue-200">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-blue-800">Confirm Your Email</DialogTitle>
              <DialogDescription className="text-blue-600">
                Please enter your email to complete the sign-in process.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleModalSubmit}>
              <Input
                type="email"
                placeholder="Enter your email"
                value={modalEmail}
                onChange={(e) => setModalEmail(e.target.value)}
                required
                className="bg-white/50 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
              />
              <DialogFooter className="mt-4">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Confirm</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Toaster position="bottom-center"/>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-white p-6">
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-800 font-serif md:text-4xl">
          {appTitle}
        </h1>

        <p className="text-center text-blue-600 mb-6">
            Share your royal moments with us! 📸
        </p>

        <div className="mb-6 flex justify-center space-x-4">
          <Button
            onClick={() => document.getElementById('fileInput')!.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            <Upload className="mr-2 h-4 w-4" /> Upload Image
          </Button>

          <input
            id="fileInput"
            type="file"
            capture="user"
            accept="image/*"
            className="sr-only"
            onChange={handleFileUpload}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {photos.map((photo) => (
            <div
              key={photo.name}
              className="relative group overflow-hidden rounded-lg shadow-lg transition-transform duration-300 ease-in-out hover:scale-105"
            >
              <img
                src={photo.url}
                alt={photo.name}
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-600/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                <button type="button" onClick={() => handleDownload(photo)}>
                  <Download className="text-white h-8 w-8" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div ref={infiniteScrollRef} className="h-4"></div>

        {loading && (
            <p className="text-center mt-4 text-blue-600">
              {photos.length > 0 ? 'Loading more royal moments...' : 'Loading royal moments...'}
            </p>
        )}

        {!loading && photos.length === 0 && (
          <p className="text-center mt-4 text-blue-600">No royal moments shared yet. Be the first! 🥰</p>
        )}

        {!loading && !hasMore && photos.length > 0 && (
          <p className="text-center mt-4 text-blue-600">You've seen all the regal love 👑❤️</p>
        )}
      </div>

      <Toaster position="bottom-center"/>
    </div>
  );
}
