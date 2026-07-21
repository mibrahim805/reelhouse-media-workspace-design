from django import forms


class DownloadForm(forms.Form):
    url = forms.URLField(
        label='Video URL',
        widget=forms.URLInput(
            attrs={
                'class': 'url-input',
                'placeholder': 'Paste a YouTube, TikTok, Instagram, Facebook, or other video link',
                'autocomplete': 'off',
            }
        ),
    )
