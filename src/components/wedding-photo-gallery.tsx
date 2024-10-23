import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react';
import { User } from 'firebase/auth';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { ref, list, getDownloadURL, getBlob, uploadBytes, StorageReference } from 'firebase/storage';
import { logEvent } from 'firebase/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Toaster, toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Download, Upload, Camera } from 'lucide-react';
import { analytics, auth, storage } from '@/lib/firebase';

const appTitle = import.meta.env.VITE_APP_TITLE;

const maxUploadSize = parseInt(import.meta.env.VITE_MAX_FILE_SIZE, 10);

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

  const captureRef = useRef<HTMLInputElement>(null);

  const uploadRef = useRef<HTMLInputElement>(null);

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

      logEvent(analytics, 'login', { email });
    } catch (error) {
      toast.error('Error signing in. Please try again.');

      logEvent(analytics, 'exception', { error, description: 'Error signing in' });
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

      logEvent(analytics, 'email_sign_in', { email });

      window.localStorage.setItem('emailForSignIn', email);

      toast.success('Sign-in link sent to your email!');
    } catch (error) {
      toast.error('Error sending sign-in link. Please try again.');

      logEvent(analytics, 'exception', { error, description: 'Error sending sign-in link' });
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

      logEvent(analytics, 'fetch_photos', { user: user?.uid, count: items.length, pageToken });

      setPhotos((prevPhotos) => pageToken ? [...prevPhotos, ...items] : items);

      setPageToken(res.nextPageToken);

      setHasMore(!!res.nextPageToken);
    } catch (error) {
      toast.error('Error fetching photos. Please try again.');

      logEvent(analytics, 'exception', { error, description: 'Error fetching photos', user: user?.uid });
    }

    setLoading(false);
  }, [user, pageToken, setPhotos, setPageToken, setHasMore, setLoading]);

  const uploadMedia = useCallback(async (file: File) => {
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

      logEvent(analytics, 'upload_image', { user: user?.uid, name, url });
    } catch (error) {
      toast.error('Error uploading image. Please try again.');

      logEvent(analytics, 'exception', { error, description: 'Error uploading image', user: user?.uid });
    }
  }, [setPhotos, user]);

  const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files![0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Invalid file type. Please upload an image or video file.');
      return;
    }

    if (file.size > (maxUploadSize * 1024 * 1024)) {
      toast.error(`File size exceeds ${maxUploadSize}MB limit. Please upload a smaller file.`);
      return;
    }

    await uploadMedia(file);

    e.target.value = '';
  }, [uploadMedia]);

  const handleModalSubmit = useCallback(async  (e: FormEvent) => {
    e.preventDefault();

    completeSignIn(modalEmail).catch(error => {
      toast.error('Error completing sign-in. Please try again.');

      logEvent(analytics, 'exception', { error, description: 'Error completing sign-in', user: user?.uid });
    });

    setIsModalOpen(false);
  }, [user, completeSignIn, modalEmail]);

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

        logEvent(analytics, 'download_image', { user: user?.uid, name: photo.name });
    } catch (error) {
        toast.error('Error downloading image. Please try again.');

        logEvent(analytics, 'exception', { error, description: 'Error downloading image', user: user?.uid });
    }
  }, [user]);

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
          toast.error('Error fetching photos. Please try again.')

          logEvent(analytics, 'exception', { error, description: 'Error fetching photos' });
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
           toast.error('Error completing sign-in. Please try again.');

            logEvent(analytics, 'exception', { description: 'Error completing sign-in', error });
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
        toast.error('Error fetching photos. Please try again.');

        logEvent(analytics, 'exception', { error, description: 'Error fetching photos' });
      });
    }

    logEvent(analytics, 'page_view', { user: user?.uid });

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
              onClick={() => captureRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            <Camera className="mr-1 h-4 w-4"/>
            <span>Capture Media</span>
          </Button>

          <Button
              onClick={() => uploadRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            <Upload className="mr-1 h-4 w-4"/>
            <span>Upload Media</span>
          </Button>

          <input
              type="file"
              capture="user"
              accept="image/*, video/*"
              className="sr-only"
              ref={captureRef}
              onChange={handleFileUpload}
          />

          <input
              type="file"
              accept="image/*, video/*"
              className="sr-only"
              ref={uploadRef}
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
